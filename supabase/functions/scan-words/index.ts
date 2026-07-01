// Supabase Edge Function — 카메라로 찍은 일본어 학습 자료(교재/노트/손글씨)에서
// 단어·표현을 인식(비전)해 추출하고, 검토 후 단어 풀(words)에 편입 + 스캔 우선순위 큐에 넣는다.
//
// 배포:  supabase functions deploy scan-words        (JWT 검증 ON — 로그인 사용자만 호출)
//   ※ tutor-chat 과 동일하게 --no-verify-jwt 를 붙이지 않는다.
// 비밀키: ANTHROPIC_API_KEY (이미 등록돼 있으면 공유). SUPABASE_URL/SERVICE_ROLE_KEY 는 기본 주입.
//
// 요청:
//   POST { action: "extract", images: [{ mediaType, data(base64) }, ...] }
//     → { words: [ {kanji, kana, meaning, pos, verbGroup, hanja, examples, level, freq}, ... ] }  (저장 안 함)
//   POST { action: "save", words: [ 위 형식(검토·수정본) ] }
//     → { saved: [ Word 행 ... ] }  (words 편입 + 요청 유저의 scanned_queue 등록)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "claude-opus-4-8"; // 손글씨 판독 정확도 우선. 비용↓ 원하면 "claude-sonnet-4-6"
const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 추출 스키마 — generate-words 와 동일하되 level(모델이 판단)이 추가됨.
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
          kanji: { type: "string", description: "표제어(한자 없으면 kana와 동일)" },
          kana: { type: "string", description: "히라가나 독음" },
          meaning: { type: "string", description: "한국어 뜻" },
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
          level: { type: "string", enum: LEVELS, description: "네가 판단한 JLPT 레벨" },
          freq: { type: "integer", enum: [1, 2, 3], description: "중요도 1=핵심 2=보통 3=덜 중요" },
        },
        required: ["kanji", "kana", "meaning", "pos", "verbGroup", "hanja", "examples", "level", "freq"],
      },
    },
  },
  required: ["words"],
};

const EXTRACT_PROMPT = `이 이미지들은 일본어 학습 자료입니다(교재·문제집·노트·손글씨 등). 이미지에 실제로 보이는 일본어 중에서 **학습 가치가 있는 단어와 표현**을 모두 골라 추출하세요.

규칙:
- 손글씨는 최대한 정확히 판독하세요. 획이 애매하면 문맥상 가장 그럴듯한 정식 표기로 복원합니다. 확신이 없어도 추측한 표기를 넣되, 이미지에 없는 단어를 지어내지는 마세요.
- 조사·어미 같은 기능어만 있는 항목, 사람 이름/고유명사는 제외. 의미 있는 명사·동사·형용사·부사·관용표현 위주로.
- kanji=표제어(한자 없으면 kana와 동일), kana=히라가나 독음.
- meaning(뜻)과 예문 ko는 **반드시 한국어(한글)로만**. 영어 단어를 쓰지 마세요.
- 동사는 1군(5단)/2군(1단)/3군(불규칙=する·来る류)으로 분류해 verbGroup에, 동사가 아니면 null.
- hanja: 각 구성 한자의 한국식 훈독을 "훈 음"으로("食"→"먹을 식"). 가나 전용 단어는 빈 배열.
- examples: 단어마다 2개(jp 한자포함·kana 히라가나·ko 한국어). 이미지 예문이 있으면 활용하고, 없으면 그 단어 수준에 맞는 쉬운 예문을 만듭니다.
- level: 각 단어의 JLPT 급수(N5~N1)를 네가 판단해 채웁니다.
- freq: 중요도 1(핵심)·2(보통)·3(덜 중요).
- 같은 단어가 여러 번 보여도 한 번만.`;

interface Cand {
  kanji: string;
  kana: string;
  meaning: string;
  pos: string;
  verbGroup: number | null;
  hanja: { char: string; reading: string }[];
  examples: { jp: string; kana: string; ko: string }[];
  level: string;
  freq: number;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// ── 검증 (형태로 걸러냄) ──
const HANGUL = /[가-힣]/;
const JP = /[぀-ヿ一-鿿]/;
const KANA = /[぀-ヿ]/;
const LATIN = /[A-Za-z]/;
const POS = ["verb", "i-adj", "na-adj", "noun", "adverb", "expression"];

function isValid(w: Cand): boolean {
  if (!w || typeof w.kanji !== "string" || typeof w.kana !== "string") return false;
  if (!JP.test(w.kanji) && !KANA.test(w.kanji)) return false; // 표제어에 일본어
  if (LATIN.test(w.kanji) || LATIN.test(w.kana)) return false; // 영문 오염 차단
  if (!KANA.test(w.kana)) return false;
  if (!HANGUL.test(w.meaning ?? "")) return false; // 뜻은 한국어
  if (!POS.includes(w.pos)) return false;
  if (!LEVELS.includes(w.level)) return false;
  return true;
}

async function extract(apiKey: string, images: { mediaType: string; data: string }[]) {
  const content: unknown[] = [{ type: "text", text: EXTRACT_PROMPT }];
  for (const img of images) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.data },
    });
  }
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
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content ?? []).find((b: { type: string }) => b.type === "text")?.text;
  if (!text) throw new Error("응답에 텍스트 없음");
  return (JSON.parse(text).words ?? []) as Cand[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY 미설정" }, 500);

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    // ── 인식만 (저장 안 함) ──
    if (action === "extract") {
      const images = Array.isArray(body.images) ? body.images : [];
      if (!images.length) return json({ error: "images 가 필요합니다" }, 400);
      const words = (await extract(apiKey, images)).filter(isValid);
      return json({ words });
    }

    // ── 검토본 저장: words 편입 + 요청 유저의 scanned_queue 등록 ──
    if (action === "save") {
      const cands = (Array.isArray(body.words) ? body.words : []).filter(isValid) as Cand[];
      if (!cands.length) return json({ error: "저장할 단어가 없습니다" }, 400);

      const url = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      // 요청 유저 식별 (JWT). scanned_queue 는 유저별이므로 필요.
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "로그인이 필요합니다" }, 401);

      const admin = createClient(url, serviceKey);

      // 편입할 행 (id는 안정적으로: 레벨+표제어 해시 대신 랜덤, 중복은 unique(kanji,level)로 흡수)
      const rows = cands.map((w) => ({
        id: `scan-${w.level}-${crypto.randomUUID().slice(0, 8)}`,
        kanji: w.kanji,
        kana: w.kana,
        meaning: w.meaning,
        level: w.level,
        pos: w.pos,
        verb_group: w.pos === "verb" ? w.verbGroup ?? 1 : null,
        hanja: w.hanja ?? [],
        examples: w.examples ?? [],
        freq: [1, 2, 3].includes(w.freq) ? w.freq : 2,
        source: "scan",
      }));

      // (kanji, level) 충돌은 무시하고 새 단어만 삽입
      const { error: upErr } = await admin
        .from("words")
        .upsert(rows, { onConflict: "kanji,level", ignoreDuplicates: true });
      if (upErr) throw upErr;

      // 방금 편입분 + 기존에 이미 있던 동일 단어의 실제 id 를 (kanji, level)로 해소
      const kanjiList = [...new Set(cands.map((w) => w.kanji))];
      const { data: found, error: selErr } = await admin
        .from("words")
        .select("id,kanji,kana,meaning,level,pos,verb_group,hanja,examples,freq")
        .in("kanji", kanjiList);
      if (selErr) throw selErr;

      const byKey = new Map<string, (typeof found)[number]>();
      for (const r of found ?? []) byKey.set(`${r.kanji}__${r.level}`, r);

      const saved: (typeof found)[number][] = [];
      const queueRows: { user_id: string; word_id: string }[] = [];
      for (const w of cands) {
        const row = byKey.get(`${w.kanji}__${w.level}`);
        if (row) {
          saved.push(row);
          queueRows.push({ user_id: uid, word_id: row.id });
        }
      }

      // 우선순위 큐 등록 (이미 있으면 무시)
      if (queueRows.length) {
        const { error: qErr } = await admin
          .from("scanned_queue")
          .upsert(queueRows, { onConflict: "user_id,word_id", ignoreDuplicates: true });
        if (qErr) throw qErr;
      }

      return json({ saved });
    }

    return json({ error: "action 은 extract | save 여야 합니다" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
