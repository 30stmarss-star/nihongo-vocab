// Supabase Edge Function — 일본 만화 페이지 한 장을 판독한다.
// 대사(읽는 순서대로) · 어휘 · 한자 · 효과음을 구조화해서 돌려준다. 저장은 하지 않는다.
//
// 배포:  npx supabase functions deploy read-manga --project-ref auvcrexjkoxvymzytlxp --use-api
//   ※ scan-words 와 마찬가지로 JWT 검증 ON (로그인 사용자만).
// 비밀키: ANTHROPIC_API_KEY (기존 함수들과 공유).
//
// 요청:
//   POST { action: "read",    image: {mediaType, data}, title? }  → { read }
//   POST { action: "save",    readId, title, gist, items[] }      → { saved[] }
//   POST { action: "regroup" }                                    → { groups[] }
//
// 저장의 원칙: **manga_log 가 진실이고 묶음은 그 위에 얹는 뷰다.**
// 로그는 공부한 순서 그대로 append 되고 절대 재정렬하지 않는다. regroup 은 그 로그의
// 구간에 이름을 붙일 뿐이라, 쌓이는 정도에 따라 몇 번이고 다시 엮어도 순서는 남는다.
//
// 이미지는 메모리에서만 다루고 어디에도 기록하지 않는다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 만화 판독은 손글씨·효과음·세로쓰기가 섞여 있어 비전 정확도가 결과 품질을 그대로 결정한다.
const MODEL = "claude-opus-5";
// Opus 5 는 thinking 이 기본 ON. effort 로 깊이를 조절한다.
//  - "low"  : 가장 빠름. 읽는 순서를 틀리는 경우가 생긴다.
//  - "medium": 기본값. 10초 목표와 판독 정확도의 절충.
//  - "high" : 격투 장면처럼 손글씨가 많은 페이지에서 더 안정적. 느리다.
// 9장 검증(실제 10장)에서 순서 오류·지어냄이 나오면 여기를 먼저 올린다.
const EFFORT = "medium";

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];
const POS = ["verb", "i-adj", "na-adj", "noun", "adverb", "expression"];

// 프롬프트가 정한 상한. 모델이 넘겨도 서버에서 자른다(구조화 출력은 배열 길이 제약을 못 건다).
const MAX_LINES = 6;
const MAX_VOCAB = 12; // 대사마다 붙으므로 페이지 전체 기준으로는 여유를 준다
const MAX_GRAMMAR = 8;
const MAX_KANJI = 6;
const MAX_SFX = 8;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    gist: { type: "string", description: "이 페이지에서 벌어지는 일 한 줄 요약(한국어)" },
    lines: {
      type: "array",
      description: "읽는 순서대로의 대사. 최대 6개.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          jp: { type: "string", description: "원문 그대로(한자 포함)" },
          kana: { type: "string", description: "전체 히라가나 독음" },
          ko: { type: "string", description: "한국어 번역" },
          note: {
            type: "string",
            description:
              "이 대사에서 짚을 참고사항 한 줄(뉘앙스·생략된 말·말투·문화). 없으면 빈 문자열.",
          },
        },
        required: ["jp", "kana", "ko", "note"],
      },
    },
    grammar: {
      type: "array",
      description: "대사에 쓰인 문법. 최대 8개.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          point: { type: "string", description: "문법 형태 그대로. 예: 〜てる, 〜なきゃ, 〜んだ" },
          ko: { type: "string", description: "무슨 뜻이고 언제 쓰는지 한국어로 한두 줄" },
          line_index: {
            type: "integer",
            description: "이 문법이 나온 lines 의 인덱스(0부터). 대사 밖이면 -1.",
          },
        },
        required: ["point", "ko", "line_index"],
      },
    },
    vocab: {
      type: "array",
      description: "학습 가치가 있는 어휘. 최대 8개.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          word: { type: "string", description: "표제어(사전형·사전 표기)" },
          surface: { type: "string", description: "본문에 나온 활용형 그대로" },
          reading: { type: "string", description: "표제어의 히라가나 독음" },
          ko: { type: "string", description: "한국어 뜻" },
          level: { type: "string", enum: LEVELS, description: "추정 JLPT 급수" },
          pos: { type: "string", enum: POS },
          verbGroup: { type: ["integer", "null"], description: "동사면 1/2/3, 아니면 null" },
          freq: { type: "integer", enum: [1, 2, 3], description: "중요도 1=핵심 2=보통 3=덜 중요" },
          hanja: {
            type: "array",
            description: "구성 한자의 한국식 훈독. 가나 전용 단어는 빈 배열.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { char: { type: "string" }, reading: { type: "string" } },
              required: ["char", "reading"],
            },
          },
          parts: { type: "string", description: "구성·어원 한 줄(한국어). 없으면 빈 문자열." },
          line_index: {
            type: "integer",
            description: "이 어휘가 나온 lines 의 인덱스(0부터). 대사 밖이면 -1.",
          },
        },
        required: [
          "word",
          "surface",
          "reading",
          "ko",
          "level",
          "pos",
          "verbGroup",
          "freq",
          "hanja",
          "parts",
          "line_index",
        ],
      },
    },
    kanji: {
      type: "array",
      description: "이 페이지에서 짚고 갈 한자. 최대 5개.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          char: { type: "string", description: "한자 한 글자" },
          on: { type: "string", description: "음독(가타카나)" },
          kun: { type: "string", description: "훈독(히라가나). 없으면 빈 문자열." },
          ko: { type: "string", description: "한국식 훈독 '먹을 식' 형태" },
          radical: { type: "string", description: "부수" },
          hint: { type: "string", description: "기억을 돕는 한 줄(한국어)" },
          line_index: {
            type: "integer",
            description: "이 한자가 나온 lines 의 인덱스(0부터). 대사 밖이면 -1.",
          },
        },
        required: ["char", "on", "kun", "ko", "radical", "hint", "line_index"],
      },
    },
    sfx: {
      type: "array",
      description: "효과음·손글씨. 대사가 아니다.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          jp: { type: "string" },
          ko: { type: "string", description: "느낌을 옮긴 한국어" },
        },
        required: ["jp", "ko"],
      },
    },
  },
  required: ["gist", "lines", "vocab", "grammar", "kanji", "sfx"],
};

const PROMPT = `이 이미지는 일본 만화의 한 페이지입니다. 원서로 읽다가 막혀서 캡처한 것입니다.

**가장 중요한 규칙: 읽을 수 없는 것은 지어내지 말고 생략하세요.**
글자가 잘렸거나, 흐리거나, 가려져 있거나, 손글씨가 확실히 판독되지 않으면 그 항목을 통째로 빼세요.
틀린 후리가나는 없느니만 못합니다. 확신이 서는 것만 넣으세요. 한 항목도 확실하지 않으면 빈 배열로 두세요.

**읽는 순서**: 일본 만화는 세로쓰기이고 페이지의 **오른쪽 위에서 왼쪽 아래로** 읽습니다.
같은 단에서는 오른쪽 말풍선이 먼저입니다. lines 배열은 반드시 이 순서로 채우세요.

**결과는 대사 하나하나를 파고들며 공부하는 화면에 쓰입니다.** 대사 아래에 그 대사의
어휘·문법·참고사항이 붙어서 위에서 아래로 읽어 내려갑니다. 그래서 vocab·grammar·kanji 의
line_index 를 **정확히** 채워야 합니다 — 이게 틀리면 엉뚱한 대사 밑에 붙습니다.

**lines (최대 6개)**
- 말풍선·모노로그 안의 대사만. 한 말풍선이 한 항목입니다.
- jp 는 원문 그대로(한자 포함), kana 는 문장 전체의 히라가나 독음, ko 는 자연스러운 한국어 번역.
- 말풍선이 6개를 넘으면 학습 가치가 큰 것부터 6개만 고르되, 고른 것끼리의 순서는 유지합니다.
- note: 그 대사에서 짚을 게 있으면 한 줄. 생략된 주어·조사, 거친/공손한 말투, 캐릭터 특유의
  어미, 교재에는 안 나오는 회화 습관, 문화적 배경 같은 것. **없으면 빈 문자열로 두세요.**
  억지로 채우지 마세요 — 번역만 봐도 아는 내용을 반복하면 방해만 됩니다.

**grammar (최대 8개)**
- 대사에 실제로 쓰인 문법 형태. 회화체·축약형 위주로 고릅니다. (〜てる·〜なきゃ·〜んだ·〜ちゃう 등)
- point 는 형태 그대로, ko 는 무슨 뜻이고 언제 쓰는지 한국어로 한두 줄.
  가능하면 교재체 대응형을 같이 적으세요. (예: 〜てる → 〜ている의 축약, 회화에서만)
- line_index 로 어느 대사에서 나왔는지 반드시 표시합니다.
- 같은 문법이 여러 대사에 나오면 처음 나온 대사에 한 번만.

**sfx (효과음·손글씨)**
- 말풍선 밖의 효과음(ドドド·バキッ 등)과 손글씨 방백은 **lines 가 아니라 여기에** 넣습니다.
- 이걸 대사에 섞지 마세요. 격투 장면에서 특히 주의.

**vocab (최대 12개)**
- 구어·속어·축약형처럼 교재에서 안 배우는 것 위주로 고릅니다. 고유명사·숫자·인명은 제외.
- word 는 반드시 **사전형(사전에 실리는 표준 표기)**. 보통 한자로 쓰는 말은 한자로 복원합니다.
  본문에 나온 활용형은 surface 에 따로 넣습니다. (예: 「食べてる」→ word 食べる / surface 食べてる)
- 원래 가나로만 쓰는 말(ちょっと·とんでもない 등)은 가나 그대로 두고 word 와 reading 을 같게 합니다.
- ko(뜻)와 번역은 **반드시 한국어(한글)로만**. 영어 단어를 쓰지 마세요.
- pos: 명사/동사/형용사/부사/표현 중 하나. 동사면 1군(5단)·2군(1단)·3군(불규칙)을 verbGroup 에, 아니면 null.
- hanja: 각 구성 한자의 한국식 훈독을 "훈 음"으로("食"→"먹을 식"). 가나 전용 단어는 빈 배열.
- freq: 1(핵심)·2(보통)·3(덜 중요).
- line_index: 그 단어가 나온 lines 의 인덱스. 대사가 아니라 효과음·간판 등에서 나왔으면 -1.

**kanji (최대 6개)**
- 이 페이지의 한자 중 짚고 갈 만한 것. 이미지에 실제로 보이는 한자만.
- line_index 로 어느 대사에서 나왔는지 표시합니다. 대사 밖(간판·효과음 등)이면 -1.

**gist**: 이 페이지에서 무슨 일이 벌어지는지 한 줄(한국어).`;

interface ImageIn {
  mediaType: string;
  data: string;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// ── 검증 ── 형태로 걸러낸다. 모델 출력은 믿지 않는다(세션기록 2026-08-03 결정).
const HANGUL = /[가-힣]/;
const JP = /[぀-ヿ一-鿿]/;
const KANA = /[぀-ヿ]/;
const LATIN = /[A-Za-z]/;

interface VocabOut {
  word: string;
  surface: string;
  reading: string;
  ko: string;
  level: string;
  pos: string;
  verbGroup: number | null;
  freq: number;
  hanja: { char: string; reading: string }[];
  parts: string;
  line_index: number;
}

/**
 * 역참조 인덱스를 실제 대사 범위 안으로 눕힌다.
 * 범위를 벗어나면 -1(대사 밖) — 엉뚱한 대사 밑에 붙는 것보다 낫다.
 */
function normIndex(v: { line_index?: unknown }, lineCount: number): void {
  const i = v.line_index;
  if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= lineCount) {
    v.line_index = -1;
  }
}

function validVocab(v: VocabOut, lineCount: number): boolean {
  if (!v || typeof v.word !== "string" || typeof v.reading !== "string") return false;
  if (!v.word.trim() && v.reading.trim()) v.word = v.reading;
  if (!JP.test(v.word) && !KANA.test(v.word)) return false;
  if (LATIN.test(v.word) || LATIN.test(v.reading)) return false; // 영문 오염 차단
  if (!KANA.test(v.reading)) return false;
  if (!HANGUL.test(v.ko ?? "")) return false; // 뜻은 한국어
  if (!POS.includes(v.pos)) return false;
  if (!LEVELS.includes(v.level)) return false;
  normIndex(v, lineCount);
  return true;
}

function validLine(l: { jp: string; kana: string; ko: string }): boolean {
  if (!l || typeof l.jp !== "string" || !l.jp.trim()) return false;
  if (!JP.test(l.jp) && !KANA.test(l.jp)) return false;
  return HANGUL.test(l.ko ?? "");
}

async function read(apiKey: string, image: ImageIn, title: string) {
  const text = title
    ? `${PROMPT}\n\n참고: 작품은 「${title}」입니다. 다만 작품 지식으로 내용을 채우지 말고, 이미지에 실제로 보이는 것만 읽으세요.`
    : PROMPT;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      // thinking 이 max_tokens 를 같이 먹는다. 판독 JSON 자체는 2~3k면 충분하므로 여유 있게.
      max_tokens: 8000,
      output_config: {
        effort: EFFORT,
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [
        {
          role: "user",
          // 이미지를 텍스트보다 앞에 두는 쪽이 결과가 낫다(Anthropic 권장).
          content: [
            { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
            { type: "text", text },
          ],
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();

  // 안전 안내로 응답이 막힌 경우 — 빈 content 를 인덱싱하면 터진다.
  if (data.stop_reason === "refusal") {
    throw new Error("이 이미지는 판독할 수 없습니다. 다른 페이지로 시도해 보세요.");
  }
  const out = (data.content ?? []).find((b: { type: string }) => b.type === "text")?.text;
  if (!out) throw new Error("응답에 판독 결과가 없습니다. 다시 시도해 주세요.");
  return JSON.parse(out);
}

// ─────────────────────────── 저장 ───────────────────────────

const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function requireUser(req: Request): Promise<string> {
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );
  const { data } = await userClient.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) throw new Error("로그인이 필요합니다");
  return uid;
}

const LEVEL_ORDER: Record<string, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };

interface SaveItem extends VocabOut {
  line_jp?: string;
  line_ko?: string;
  line_kana?: string;
}

/**
 * 선별 저장. 사용자가 고른 항목만 들어온다(전량 적재 금지).
 *
 * 레벨은 **기존 어휘 데이터가 이긴다.** words 는 (kanji, level) 이 유니크라,
 * LLM 추정 레벨이 기존 것과 다르면 같은 단어가 두 레벨로 중복 삽입된다.
 * 그래서 이미 있는 표제어면 그 행을 그대로 쓴다 — 중복도 막고 밴드도 안 흔들린다.
 */
async function saveItems(
  req: Request,
  readId: string,
  title: string,
  gist: string,
  items: SaveItem[]
) {
  const uid = await requireUser(req);
  const db = admin();

  const kanjiList = [...new Set(items.map((w) => w.word))];
  const { data: existing } = await db
    .from("words")
    .select("id,kanji,kana,meaning,level,pos,verb_group,hanja,examples,freq")
    .in("kanji", kanjiList);

  // 같은 표제어가 여러 레벨에 있으면 쉬운 쪽을 쓴다(클라이언트 cleanWords 와 같은 규칙)
  const known = new Map<string, (typeof existing)[number]>();
  for (const r of existing ?? []) {
    const prev = known.get(r.kanji);
    if (!prev || LEVEL_ORDER[r.level] < LEVEL_ORDER[prev.level]) known.set(r.kanji, r);
  }

  const fresh = items.filter((w) => !known.has(w.word));
  if (fresh.length) {
    const rows = fresh.map((w) => ({
      id: `manga-${w.level}-${crypto.randomUUID().slice(0, 8)}`,
      kanji: w.word,
      kana: w.reading,
      meaning: w.ko,
      level: w.level,
      pos: w.pos,
      verb_group: w.pos === "verb" ? (w.verbGroup ?? 1) : null,
      hanja: w.hanja ?? [],
      // 예문은 그 단어를 만난 대사 그대로 — 문맥이 곧 기억의 고리다
      examples: w.line_jp
        ? [{ jp: w.line_jp, kana: w.line_kana ?? "", ko: w.line_ko ?? "" }]
        : [],
      freq: [1, 2, 3].includes(w.freq) ? w.freq : 2,
      source: "manga",
    }));
    const { error } = await db
      .from("words")
      .upsert(rows, { onConflict: "kanji,level", ignoreDuplicates: true });
    if (error) throw error;

    const { data: after } = await db
      .from("words")
      .select("id,kanji,kana,meaning,level,pos,verb_group,hanja,examples,freq")
      .in("kanji", fresh.map((w) => w.word));
    for (const r of after ?? []) {
      const prev = known.get(r.kanji);
      if (!prev || LEVEL_ORDER[r.level] < LEVEL_ORDER[prev.level]) known.set(r.kanji, r);
    }
  }

  const saved = items.map((w) => known.get(w.word)).filter(Boolean);
  if (!saved.length) return { saved: [] };

  // 단어장 + 우선순위 큐 + 순서 로그. 전부 중복 무시(같은 단어를 다시 담아도 순서가 안 흐트러진다).
  const ids = saved.map((r) => r!.id);
  await db
    .from("wordbook")
    .upsert(ids.map((id) => ({ user_id: uid, word_id: id })), {
      onConflict: "user_id,word_id",
      ignoreDuplicates: true,
    });
  await db
    .from("scanned_queue")
    .upsert(ids.map((id) => ({ user_id: uid, word_id: id })), {
      onConflict: "user_id,word_id",
      ignoreDuplicates: true,
    });

  const logRows = items
    .map((w, i) => {
      const row = known.get(w.word);
      if (!row) return null;
      return {
        user_id: uid,
        word_id: row.id,
        read_id: readId,
        title: title || null,
        gist: gist || null,
        line_jp: w.line_jp ?? null,
        line_ko: w.line_ko ?? null,
        // 같은 판독 안에서도 고른 순서를 지킨다
        saved_at: new Date(Date.now() + i).toISOString(),
      };
    })
    .filter(Boolean);
  await db.from("manga_log").upsert(logRows, {
    onConflict: "user_id,word_id",
    ignoreDuplicates: true,
  });

  return { saved };
}

// ─────────────────────────── 묶음 ───────────────────────────

const NAME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          idx: { type: "integer", description: "입력으로 준 구간의 번호" },
          name: { type: "string", description: "묶음 이름(한국어, 12자 안팎)" },
          subtitle: { type: "string", description: "한 줄 설명. 없으면 빈 문자열." },
          kind: {
            type: "string",
            enum: ["scene", "flow", "theme", "day"],
            description: "이 구간을 무엇으로 묶었는지",
          },
        },
        required: ["idx", "name", "subtitle", "kind"],
      },
    },
  },
  required: ["groups"],
};

const NAME_PROMPT = `아래는 한 학습자가 일본 만화를 읽다가 막혀서 담아 둔 단어들입니다.
담은 순서대로 구간이 나뉘어 있고, 각 구간에는 그때 읽던 페이지의 요약과 대사, 담은 단어가 들어 있습니다.

각 구간에 **단어장에서 볼 이름**을 붙여 주세요.

- 이름은 대사와 요약을 보고 **그 장면이 떠오르게** 짓습니다. "N3 단어 12개" 같은 건 쓸모없습니다.
  좋은 예: "돌아가려는 걸 붙잡다", "체육관 대치", "첫 시합 전날 밤"
- 한국어로 12자 안팎. 작품명은 이미 따로 보이니 이름에 넣지 마세요.
- subtitle 은 한 줄 설명. 붙일 말이 없으면 빈 문자열로 두세요.
- kind 는 그 구간을 무엇으로 묶은 것인지:
  - scene : 한 장면·한 대목 (기본값. 대사가 하나의 상황으로 이어질 때)
  - flow  : 여러 장면이 이어진 흐름 (구간이 길거나 이야기가 진행될 때)
  - theme : 장면보다 주제로 묶는 게 나을 때 (감정 표현·존댓말·욕설 등)
  - day   : 뚜렷한 장면도 주제도 없어 "언제 공부했나"로 묶는 게 나을 때
- **앞선 묶음 이름들이 같이 주어지면 그 흐름을 이어 주세요.** 같은 장면이 계속되면
  "체육관 대치 ②" 처럼 잇고, 새 국면이면 새 이름을 붙입니다. 앞 이름을 그대로 반복하지는 마세요.
- 담긴 양이 적으면 잘게(scene), 많이 쌓였으면 크게(flow/theme) 묶는 쪽이 읽기 좋습니다.`;

interface LogRow {
  id: number;
  word_id: string;
  read_id: string;
  title: string | null;
  gist: string | null;
  line_jp: string | null;
  saved_at: string;
}

/** 로그를 구간으로 자른다 — 작품이 바뀌거나, 45분 넘게 끊기거나, 너무 커지면 자른다. */
function cutRuns(rows: LogRow[]): LogRow[][] {
  const GAP_MS = 45 * 60 * 1000;
  const MAX = 14;
  const runs: LogRow[][] = [];
  for (const r of rows) {
    const cur = runs[runs.length - 1];
    const prev = cur?.[cur.length - 1];
    const cut =
      !cur ||
      cur.length >= MAX ||
      (prev?.title ?? "") !== (r.title ?? "") ||
      new Date(r.saved_at).getTime() - new Date(prev!.saved_at).getTime() > GAP_MS;
    if (cut) runs.push([r]);
    else cur.push(r);
  }
  return runs;
}

async function regroup(req: Request, apiKey: string) {
  const uid = await requireUser(req);
  const db = admin();

  const { data: rows } = await db
    .from("manga_log")
    .select("id,word_id,read_id,title,gist,line_jp,saved_at")
    .eq("user_id", uid)
    .order("id", { ascending: true });
  const log = (rows ?? []) as LogRow[];
  if (!log.length) return { groups: [] };

  const { data: existing } = await db
    .from("manga_group")
    .select("id,name,from_id,to_id")
    .eq("user_id", uid)
    .order("from_id", { ascending: true });

  // 이미 이름이 붙은 구간은 건드리지 않는다 — 다시 부르는 비용도, 이름이 바뀌는 혼란도 없다.
  const covered = Math.max(0, ...(existing ?? []).map((g) => g.to_id));
  const pending = cutRuns(log.filter((r) => r.id > covered));
  if (!pending.length) return { groups: existing ?? [] };

  const payload = pending.map((run, idx) => ({
    idx,
    title: run[0].title ?? "",
    count: run.length,
    gists: [...new Set(run.map((r) => r.gist).filter(Boolean))].slice(0, 4),
    lines: [...new Set(run.map((r) => r.line_jp).filter(Boolean))].slice(0, 8),
  }));
  const prevNames = (existing ?? []).slice(-5).map((g) => g.name);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      // 이름 짓기는 판독보다 가벼운 일이다.
      output_config: { effort: "low", format: { type: "json_schema", schema: NAME_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                NAME_PROMPT +
                (prevNames.length ? `\n\n앞선 묶음 이름들: ${prevNames.join(" / ")}` : "") +
                `\n\n지금까지 담은 단어 총 ${log.length}개.\n\n` +
                JSON.stringify(payload, null, 2),
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content ?? []).find((b: { type: string }) => b.type === "text")?.text;
  const named: { idx: number; name: string; subtitle: string; kind: string }[] = text
    ? (JSON.parse(text).groups ?? [])
    : [];

  const byIdx = new Map(named.map((g) => [g.idx, g]));
  const inserts = pending.map((run, idx) => {
    const g = byIdx.get(idx);
    return {
      user_id: uid,
      // 이름 짓기가 실패해도 묶음은 남긴다 — 순서가 끊기는 것보다 낫다
      name: g?.name?.trim() || (run[0].title ? `${run[0].title}에서` : "읽은 자리"),
      subtitle: g?.subtitle?.trim() || null,
      kind: ["scene", "flow", "theme", "day"].includes(g?.kind ?? "") ? g!.kind : "scene",
      from_id: run[0].id,
      to_id: run[run.length - 1].id,
    };
  });
  const { error } = await db.from("manga_group").insert(inserts);
  if (error) throw error;

  const { data: all } = await db
    .from("manga_group")
    .select("id,name,subtitle,kind,from_id,to_id")
    .eq("user_id", uid)
    .order("from_id", { ascending: true });
  return { groups: all ?? [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY 미설정" }, 500);

    const body = await req.json().catch(() => ({}));

    if (body?.action === "save") {
      // 클라이언트가 보낸 값이라 다시 검증한다 — words 는 모든 사용자가 함께 쓰는 테이블이다.
      const items = (Array.isArray(body.items) ? body.items : ([] as SaveItem[])).filter(
        (w: SaveItem) =>
          w &&
          typeof w.word === "string" &&
          (JP.test(w.word) || KANA.test(w.word)) &&
          !LATIN.test(w.word) &&
          KANA.test(w.reading ?? "") &&
          HANGUL.test(w.ko ?? "") &&
          POS.includes(w.pos) &&
          LEVELS.includes(w.level)
      ) as SaveItem[];
      if (!items.length) return json({ error: "저장할 단어가 없습니다" }, 400);
      return json(
        await saveItems(
          req,
          typeof body.readId === "string" ? body.readId : crypto.randomUUID(),
          typeof body.title === "string" ? body.title.trim() : "",
          typeof body.gist === "string" ? body.gist : "",
          items
        )
      );
    }

    if (body?.action === "regroup") return json(await regroup(req, apiKey));

    if (body?.action !== "read") {
      return json({ error: 'action 은 read | save | regroup 이어야 합니다' }, 400);
    }

    const image = body.image as ImageIn | undefined;
    if (!image?.data || !image?.mediaType) return json({ error: "image 가 필요합니다" }, 400);
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(image.mediaType)) {
      return json({ error: "지원하지 않는 이미지 형식입니다" }, 400);
    }

    const raw = await read(apiKey, image, typeof body.title === "string" ? body.title.trim() : "");

    const lines = (Array.isArray(raw.lines) ? raw.lines : []).filter(validLine).slice(0, MAX_LINES);
    const vocab = (Array.isArray(raw.vocab) ? raw.vocab : [])
      .filter((v: VocabOut) => validVocab(v, lines.length))
      .slice(0, MAX_VOCAB);
    const grammar = (Array.isArray(raw.grammar) ? raw.grammar : [])
      .filter((g: { point?: string; ko?: string; line_index?: number }) => {
        if (typeof g?.point !== "string" || !g.point.trim()) return false;
        if (!HANGUL.test(g.ko ?? "")) return false; // 설명은 한국어
        normIndex(g, lines.length);
        return true;
      })
      .slice(0, MAX_GRAMMAR);
    const kanji = (Array.isArray(raw.kanji) ? raw.kanji : [])
      .filter((k: { char?: string; line_index?: number }) => {
        if (typeof k?.char !== "string" || !JP.test(k.char)) return false;
        normIndex(k, lines.length);
        return true;
      })
      .slice(0, MAX_KANJI);
    const sfx = (Array.isArray(raw.sfx) ? raw.sfx : [])
      .filter((s: { jp?: string }) => typeof s?.jp === "string" && s.jp.trim())
      .slice(0, MAX_SFX);

    return json({
      read: {
        gist: typeof raw.gist === "string" ? raw.gist : "",
        lines,
        vocab,
        grammar,
        kanji,
        sfx,
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
