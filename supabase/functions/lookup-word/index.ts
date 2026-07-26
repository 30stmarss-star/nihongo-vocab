// Supabase Edge Function — 사전에 없는 단어를 정식 카드로 만들어 DB에 넣는다.
//
// 배포:  supabase functions deploy lookup-word   (JWT 검증 ON)
// 비밀키: ANTHROPIC_API_KEY + SUPABASE_SERVICE_ROLE_KEY(플랫폼이 자동 주입)
//
// 작문 모범답안·예문에서 처음 보는 단어를 탭했을 때 쓴다.
// 이미 있는 단어면 그 행을 그대로 돌려주고, 없을 때만 생성해서 저장한다.
//
// 요청:  POST { kanji, kana?, context? }
// 응답:  { word: <words 테이블 행> , created: boolean }

const MODEL = "claude-opus-5";
const MAX_TOKENS = 4000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `당신은 한국인 학습자용 일본어 단어 카드를 만드는 사전 편찬자입니다.

주어진 단어의 카드를 만드세요. 문장 안에서 쓰인 형태로 주어지면 **사전형(기본형)**으로 되돌려 카드를 만듭니다.

## 필드
- kanji: 표제어. **사전에 실리는 표준 표기**로. 문장에 가나로 쓰여 있어도 보통 한자로 쓰는
  단어면 한자로 복원합니다(だいじょうぶ→大丈夫, ぜんぜん→全然). 원래 가나로만 쓰는 말은 가나 그대로 두고 kana와 같게 합니다.
  절대 빈 문자열로 두지 마세요.
- kana: 히라가나 독음 (가타카나 외래어면 가타카나 그대로).
- meaning: 한국어 뜻. 짧고 정확하게. 여러 뜻이면 쉼표로 2개까지.
- level: JLPT 급수 "N5" | "N4" | "N3" | "N2" | "N1" 중 하나.
- pos: "verb" | "i-adj" | "na-adj" | "noun" | "adverb" | "expression" 중 하나.
- verbGroup: 동사면 1(5단) | 2(1단) | 3(불규칙), 아니면 null.
- hanja: 구성 한자의 한국식 훈독 배열. (예) [{"char":"切","reading":"끊을 절"},{"char":"符","reading":"부호 부"}]
  가나만으로 된 단어면 빈 배열.
- examples: 예문 2개. 각각 {"jp":"한자 포함 문장","kana":"히라가나 독음","ko":"한국어 뜻"}.
  **jp에는 반드시 한자를 살려 쓰세요** (전부 히라가나로 쓰지 말 것).
  급수에 맞는 쉬운 문장으로.

## 규칙
- 독음·뜻·급수를 지어내지 마세요. 확신이 없으면 보수적으로(더 높은 급수로) 매기세요.
- 설명은 한국어로만.

## 출력 — 반드시 JSON 하나만 (앞뒤 다른 텍스트 금지)
{"kanji":"切符","kana":"きっぷ","meaning":"표, 티켓","level":"N5","pos":"noun","verbGroup":null,"hanja":[{"char":"切","reading":"끊을 절"},{"char":"符","reading":"부호 부"}],"examples":[{"jp":"切符を買います。","kana":"きっぷをかいます。","ko":"표를 삽니다."}]}`;

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON 없음");
  return JSON.parse(text.slice(start, end + 1));
}

/** kanji+kana로 안정적인 id를 만든다 (같은 단어를 두 번 만들지 않게) */
async function makeId(level: string, kanji: string, kana: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${kanji}|${kana}`));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `ai-${level}-${hex.slice(0, 8)}`;
}

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];
const POS = ["verb", "i-adj", "na-adj", "noun", "adverb", "expression"];

/** 서비스 롤로 words 테이블에 직접 질의/삽입 (RLS 우회 — 쓰기는 서버만) */
async function db(path: string, init: RequestInit): Promise<Response> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase 서버 자격증명 미설정");
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY 미설정" }, 500);

    const body = await req.json().catch(() => ({}));
    const kanji = String(body?.kanji ?? "").trim().slice(0, 40);
    const kana = String(body?.kana ?? "").trim().slice(0, 60);
    const context = String(body?.context ?? "").slice(0, 200);
    if (!kanji) return json({ error: "kanji가 필요합니다" }, 400);

    // 1) 이미 있는 단어면 그대로 돌려준다
    const q = new URLSearchParams({ select: "*", kanji: `eq.${kanji}`, limit: "1" });
    if (kana) q.set("kana", `eq.${kana}`);
    const found = await db(`words?${q}`, { method: "GET" });
    if (found.ok) {
      const rows = await found.json();
      if (Array.isArray(rows) && rows.length) return json({ word: rows[0], created: false });
    }

    // 2) 없으면 카드를 만든다
    const userMsg = `단어: ${kanji}${kana ? ` (${kana})` : ""}${
      context ? `\n쓰인 문장: ${context}` : ""
    }\n\n이 단어의 카드를 JSON으로 출력하세요.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { effort: "low" },
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!res.ok) return json({ error: `Anthropic ${res.status}: ${await res.text()}` }, 502);

    const data = await res.json();
    if (data.stop_reason === "refusal") return json({ error: "카드를 만들 수 없었어요." }, 502);
    const text = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .trim();

    let card: Record<string, unknown>;
    try {
      card = extractJson(text) as Record<string, unknown>;
    } catch {
      return json({ error: "응답 파싱 실패", raw: text.slice(0, 300) }, 502);
    }

    const outKanji = String(card.kanji ?? kanji);
    const outKana = String(card.kana ?? kana ?? outKanji);
    const level = LEVELS.includes(String(card.level)) ? String(card.level) : "N3";
    const pos = POS.includes(String(card.pos)) ? String(card.pos) : "noun";
    const row = {
      id: await makeId(level, outKanji, outKana),
      kanji: outKanji,
      kana: outKana,
      meaning: String(card.meaning ?? "").slice(0, 200),
      level,
      pos,
      verb_group: pos === "verb" ? Number(card.verbGroup) || 1 : null,
      hanja: Array.isArray(card.hanja) ? card.hanja : [],
      examples: Array.isArray(card.examples) ? card.examples : [],
      freq: 3, // 문장에서 주워 담은 단어라 학습 우선순위는 낮게
      source: "ai",
    };
    if (!row.meaning) return json({ error: "뜻을 만들지 못했어요." }, 502);

    // 3) 저장. 같은 표제어+급수가 이미 있으면(유니크 인덱스) 충돌 → 그 행을 돌려준다
    const ins = await db("words?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([row]),
    });
    if (!ins.ok) {
      const msg = await ins.text();
      console.warn("[lookup-word] 저장 실패:", msg);
      // 저장에 실패해도 카드 자체는 쓸 수 있게 돌려준다
      return json({ word: row, created: false, saveError: msg.slice(0, 200) });
    }
    const saved = await ins.json();
    return json({ word: Array.isArray(saved) ? saved[0] : row, created: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
