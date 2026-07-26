// Supabase Edge Function — 하루 코스 시험의 '문장형' 문제를 만든다.
//
// 배포:  supabase functions deploy generate-exam   (JWT 검증 ON)
// 비밀키: ANTHROPIC_API_KEY (기존 함수들과 공유)
//
// 단어 문제(읽기·표기·뜻·활용)는 앱이 규칙으로 만든다. 여기서는 규칙으로 못 만드는
// 문맥 규정 / 유의 표현 / 용법만 담당한다. 단어 하나당 문항 하나 — 비용을 아끼려고
// 유형은 모델이 그 단어에 가장 맞는 걸로 고르게 한다.
//
// 요청:  POST { level, words: [{ kanji, kana, meaning, pos }] }
// 응답:  { items: [{ kanji, kind, sentence, ko, choices[4], answerIndex }] }

const MODEL = "claude-opus-5";
const MAX_TOKENS = 16000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `당신은 JLPT 문자·어휘 파트 출제자입니다. 주어진 단어마다 문항을 하나씩 만듭니다.

## 유형 (단어마다 가장 잘 맞는 것 하나를 고르세요)
1. "cloze" — 문맥 규정. 문장에 빈칸 ＿ 을 하나 두고, 그 자리에 들어갈 단어를 고르게 합니다.
   - sentence: 빈칸 ＿ 이 정확히 하나 들어간 일본어 문장
   - choices: 빈칸 후보 4개 (정답 = 주어진 단어의 표기 또는 그 활용형)
2. "synonym" — 유의 표현. 문장 안의 표현과 바꿔 쓸 수 있는 말을 고르게 합니다.
   - sentence: 주어진 단어가 【 】로 감싸여 들어간 일본어 문장
   - choices: 바꿔 쓸 표현 4개
3. "usage" — 용법. 그 단어가 **올바르게** 쓰인 문장을 고르게 합니다.
   - sentence: 빈 문자열
   - choices: 일본어 문장 4개. 정답만 어법에 맞고, 나머지 3개는 그 단어를 어색하게 쓴 문장.

## 출제 규칙
- 학습자 급수에 맞는 쉬운 문법·어휘만 씁니다. 급수를 넘는 한자에는 무리하지 마세요.
- 오답은 **그럴듯해야** 합니다. 뜻만 보고 지워지는 보기는 안 됩니다.
  품사가 같고, 문장에 넣어도 문법적으로는 말이 되는 것으로.
- choices는 정확히 4개, answerIndex는 정답의 0-기반 위치.
- ko: 문장의 한국어 뜻. usage 유형은 정답 문장의 뜻.
- 단어마다 정확히 하나씩, 요청받은 단어 순서 그대로.
- 유형이 한쪽으로 쏠리지 않게 섞으세요.

## 출력 — 반드시 JSON 하나만 (앞뒤 다른 텍스트 금지)
{"items":[{"kanji":"辞書","kind":"cloze","sentence":"わからない言葉は＿で調べます。","ko":"모르는 단어는 사전으로 찾습니다.","choices":["辞書","地図","切符","写真"],"answerIndex":0}]}`;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY 미설정" }, 500);

    const body = await req.json().catch(() => ({}));
    const level = String(body?.level ?? "N5");
    const words: Array<{ kanji: string; kana: string; meaning: string; pos: string }> =
      Array.isArray(body?.words) ? body.words.slice(0, 60) : [];
    if (!words.length) return json({ error: "words가 필요합니다" }, 400);

    const list = words
      .map((w, i) => `${i + 1}. ${w.kanji} (${w.kana}) — ${w.meaning} · ${w.pos}`)
      .join("\n");
    const userMsg = `학습자 급수: ${level}\n\n단어 목록:\n${list}\n\n각 단어마다 문항 하나씩, 순서대로 JSON으로 출력하세요.`;

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
        // 기계적인 출제라 깊게 생각할 필요가 없다 — 비용·지연을 아낀다
        output_config: { effort: "low" },
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!res.ok) {
      return json({ error: `Anthropic ${res.status}: ${await res.text()}` }, 502);
    }

    const data = await res.json();
    if (data.stop_reason === "refusal") return json({ error: "문제를 만들 수 없었어요." }, 502);

    const text = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .trim();

    try {
      return json(extractJson(text));
    } catch {
      return json({ error: "응답 파싱 실패", raw: text.slice(0, 400) }, 502);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
