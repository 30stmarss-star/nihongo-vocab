// Supabase Edge Function — 서버에서 Claude API로 단어를 생성해 DB에 저장
//
// 배포:  supabase functions deploy generate-words --no-verify-jwt
// 비밀키: supabase secrets set ANTHROPIC_API_KEY=sk-... FUNCTION_SECRET=...
// 호출:  POST /functions/v1/generate-words   (헤더 x-secret: <FUNCTION_SECRET>)
//        본문(선택) { "level": "N3", "count": 30 }  — 없으면 부족한 레벨을 자동 보충
//
// 크론(매일): Supabase Dashboard → Database → Cron 또는 pg_cron 으로
//   net.http_post(...) 를 호출하도록 등록하면 "컴퓨터 없이 자동 확장"이 됩니다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "claude-opus-4-8"; // 비용↓: "claude-sonnet-4-6"
// 레벨별 목표 단어 수 (도달하면 생성 중단). 자유롭게 조정.
const TARGET: Record<string, number> = { N5: 300, N4: 400, N3: 450, N2: 500 };
const PER_RUN_CAP = 40; // 한 번 호출에 레벨당 최대 생성 수 (크론 1회당 점진 충전)

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    words: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kanji: { type: "string" },
          kana: { type: "string" },
          meaning: { type: "string" },
          pos: { type: "string", enum: ["verb", "i-adj", "na-adj", "noun", "adverb", "expression"] },
          verbGroup: { type: ["integer", "null"], description: "동사면 1/2/3, 아니면 null" },
          hanja: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { char: { type: "string" }, reading: { type: "string" } },
              required: ["char", "reading"],
            },
          },
          examples: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { jp: { type: "string" }, kana: { type: "string" }, ko: { type: "string" } },
              required: ["jp", "kana", "ko"],
            },
          },
          freq: {
            type: "integer",
            enum: [1, 2, 3],
            description: "중요도/빈도: 1=핵심(가장 자주 씀) 2=보통 3=덜 중요",
          },
        },
        required: ["kanji", "kana", "meaning", "pos", "verbGroup", "hanja", "examples", "freq"],
      },
    },
  },
  required: ["words"],
};

function prompt(level: string, count: number, exclude: string[]): string {
  return `당신은 일본어(JLPT) 교재 편집자입니다. JLPT ${level} 수준의 학습 단어 ${count}개를 만들어 주세요.

규칙:
- 정확성이 최우선. 독음(히라가나), 동사 군 분류, 한자 훈독, 예문이 모두 정확해야 합니다.
- meaning(뜻)과 예문의 ko는 **반드시 한국어(한글)로만** 작성. 영어 단어(예: "choose", "large")를 절대 쓰지 마세요.
- 동사는 1군(5단)/2군(1단)/3군(불규칙=する·来る류)으로 분류해 verbGroup에 넣고, 동사가 아니면 verbGroup은 null.
- hanja: 각 구성 한자의 한국식 훈독을 "훈 음" 형태로 ("食"→"먹을 식"). 가나 전용 단어는 빈 배열.
- examples: 단어마다 2개. ${level}에서 이해 가능한 쉬운 어휘로만, jp(한자 포함)·kana(히라가나)·ko(한국어)를 모두 채움.
- 품사를 다양하게 섞고 ${level} 빈출 단어 위주로.
- freq: 그 단어의 중요도/사용빈도를 1(핵심·가장 자주)·2(보통)·3(덜 중요)로 매기세요. **가장 중요한 단어(freq=1)부터** 우선 생성.
- 아래 '이미 있는 단어'와 표제어가 겹치지 않게:
${exclude.join(", ")}`;
}

async function generate(apiKey: string, level: string, count: number, exclude: string[]) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      // 사고 끔: 구조화 출력으로 형식이 강제되어 품질 영향은 미미하고 비용/예측성 ↑.
      // (품질을 더 끌어올리려면 thinking: { type: "adaptive" } 추가)
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: prompt(level, count, exclude) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content ?? []).find((b: any) => b.type === "text")?.text;
  if (!text) throw new Error("응답에 텍스트 없음");
  return JSON.parse(text).words as any[];
}

// ── 검증 규칙 (하드코딩이 아니라 형태로 걸러냄) ──
const HANGUL = /[가-힣]/; // 한글
const JP = /[぀-ヿ一-鿿]/; // 가나 또는 한자
const KANA = /[぀-ヿ]/; // 가나
const LATIN = /[A-Za-z]/; // 표제어에 섞이면 안 되는 영문(오염 데이터)
const POS = ["verb", "i-adj", "na-adj", "noun", "adverb", "expression"];

function isValid(w: any): boolean {
  if (!w || typeof w.kanji !== "string" || typeof w.kana !== "string") return false;
  if (!JP.test(w.kanji)) return false; // 표제어에 일본어가 있어야
  if (LATIN.test(w.kanji)) return false; // 영문 섞인 깨진 표제어 차단
  if (!KANA.test(w.kana)) return false; // 독음은 가나
  if (LATIN.test(w.kana)) return false; // 독음에 영문 섞인 오염 차단
  if (!HANGUL.test(w.meaning ?? "")) return false; // 뜻은 한국어(영어 뜻 차단)
  if (!POS.includes(w.pos)) return false;
  if (!Array.isArray(w.examples) || w.examples.length === 0) return false;
  for (const ex of w.examples) {
    if (!JP.test(ex?.jp ?? "") || !HANGUL.test(ex?.ko ?? "")) return false;
  }
  return true;
}

function rowsFrom(words: any[], level: string) {
  return words.map((w) => ({
    id: `gen-${level}-${crypto.randomUUID().slice(0, 8)}`,
    kanji: w.kanji,
    kana: w.kana,
    meaning: w.meaning,
    level,
    pos: w.pos,
    verb_group: w.pos === "verb" ? w.verbGroup ?? 1 : null,
    hanja: w.hanja ?? [],
    examples: w.examples ?? [],
    freq: [1, 2, 3].includes(w.freq) ? w.freq : 2,
    source: "ai",
  }));
}

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("FUNCTION_SECRET");
    if (secret && req.headers.get("x-secret") !== secret) {
      return new Response("forbidden", { status: 403 });
    }
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return new Response("ANTHROPIC_API_KEY 미설정", { status: 500 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const summary: Record<string, number> = {};

    // 기존 불량 단어 정리 (가벼운 규칙: 영어 뜻 / 일본어 아닌 표제어) — 메모리 절약 위해 최소 컬럼만
    {
      const { data: all } = await supabase.from("words").select("id,kanji,kana,meaning");
      const badIds = (all ?? [])
        .filter(
          (w: any) =>
            !HANGUL.test(w.meaning ?? "") ||
            !JP.test(w.kanji ?? "") ||
            LATIN.test(w.kanji ?? "") || // 영문 섞인 오염 표제어
            LATIN.test(w.kana ?? ""), // 영문 섞인 오염 독음
        )
        .map((w: any) => w.id);
      if (badIds.length) {
        await supabase.from("words").delete().in("id", badIds);
        summary.cleaned = badIds.length;
      }
    }

    // 처리할 (레벨, 개수) 목록
    let jobs: { level: string; count: number }[];
    if (body.level) {
      jobs = [{ level: body.level, count: Math.min(body.count ?? PER_RUN_CAP, PER_RUN_CAP) }];
    } else {
      // 자동 모드: 가장 부족한 레벨 '하나만' 보충 (리소스 한도 회피, 크론이 반복 호출)
      const { data: counts } = await supabase.rpc("word_counts");
      const have: Record<string, number> = {};
      for (const r of counts ?? []) have[r.level] = Number(r.n);
      jobs = Object.entries(TARGET)
        .map(([level, target]) => ({ level, count: Math.min(target - (have[level] ?? 0), PER_RUN_CAP) }))
        .filter((j) => j.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 1);
    }

    // 전체 레벨에 이미 있는 표제어 (교차 레벨 중복 방지 — 같은 단어가 N5·N4 양쪽에 들어가는 일 차단)
    const { data: allKanjiRows } = await supabase.from("words").select("kanji");
    const haveKanji = new Set((allKanjiRows ?? []).map((r: any) => r.kanji));

    for (const job of jobs) {
      const { data: existing } = await supabase
        .from("words")
        .select("kanji")
        .eq("level", job.level);
      const exclude = (existing ?? []).map((r: any) => r.kanji); // 프롬프트 힌트용(같은 레벨)

      const words = (await generate(apiKey, job.level, job.count, exclude)).filter(isValid);
      // 어느 레벨에든 이미 있는 표제어는 제외
      const rows = rowsFrom(words, job.level).filter((r) => !haveKanji.has(r.kanji));
      for (const r of rows) haveKanji.add(r.kanji); // 같은 호출 내 추가 중복도 방지

      // (kanji, level) 충돌은 무시하고 새 단어만 삽입
      const { data: inserted, error } = await supabase
        .from("words")
        .upsert(rows, { onConflict: "kanji,level", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      summary[job.level] = inserted?.length ?? 0;
    }

    return Response.json({ ok: true, added: summary });
  } catch (e) {
    return new Response(`error: ${e instanceof Error ? e.message : e}`, { status: 500 });
  }
});
