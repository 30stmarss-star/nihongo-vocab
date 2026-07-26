// Supabase Edge Function — 예문 한 문장을 단어 단위로 분해한다.
//
// 배포:  supabase functions deploy analyze-sentence   (JWT 검증 ON)
// 비밀키: ANTHROPIC_API_KEY (기존 함수들과 공유)
//
// 규칙 기반 활용기가 놓치는 형태(사역수동·구어 축약 등)까지 잡기 위한 보강 경로.
// 요청:  POST { sentence, ko? }                      → { tokens: [...] }
//        POST { sentences: ["...", "..."] }          → { results: [{ sentence, tokens }] }
//   묶음 요청은 코스 시작 때 오늘 예문을 미리 분석해 두는 용도(호출 수·비용 절감).
//   surface를 순서대로 이으면 원문과 정확히 같아야 한다(클라이언트가 검증).

const MODEL = "claude-opus-5";
const MAX_TOKENS = 24000; // 묶음 분석(최대 40문장)까지 담을 여유

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `당신은 일본어 문장을 한국인 학습자용으로 분해하는 형태소 분석기입니다.

## 분해 규칙
- 문장을 '학습자가 하나로 인식할 단위'로 끊습니다. 동사·형용사는 활용어미까지 한 덩어리로 (예: 「調べます」를 「調べ」+「ます」로 쪼개지 말 것).
- 조사(は·が·を·に·で·から…), 문장부호(、。)도 각각 하나의 토큰으로 냅니다.
- **surface를 순서대로 모두 이으면 원문과 한 글자도 다르지 않아야 합니다.** 글자를 빼거나 더하지 마세요.

## 토큰마다
- surface: 문장에 나온 그대로의 표기
- base: 사전형 (동사·형용사는 기본형, 그 외에는 surface와 동일)
- kana: base의 히라가나 독음 (조사·부호는 surface 그대로)
- meaning: 한국어 뜻. 짧게.
- pos: "동사" / "い형용사" / "な형용사" / "명사" / "부사" / "조사" / "표현" / "부호" 중 하나
- level: JLPT 급수 "N5"~"N1". 모르면 빈 문자열.
- note: 활용·문법 설명 한 줄. 기본형 그대로면 빈 문자열.
  (예) 「調べます」 → "調べる의 정중형(ます형)"
  (예) 「を」 → "목적어를 나타내는 조사"

## 규칙
- 설명은 **한국어로만**. 영어 금지.
- 독음·뜻을 지어내지 마세요.

## 출력 — 반드시 JSON 하나만 (앞뒤 다른 텍스트 금지)
문장이 하나면:
{"tokens":[{"surface":"辞書","base":"辞書","kana":"じしょ","meaning":"사전","pos":"명사","level":"N5","note":""}]}
문장이 여러 개면 받은 순서 그대로:
{"results":[{"sentence":"(원문 그대로)","tokens":[...]}]}`;

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
    const many: string[] = Array.isArray(body?.sentences)
      ? body.sentences.filter((s: unknown) => typeof s === "string" && s.trim()).slice(0, 40)
      : [];
    const sentence = String(body?.sentence ?? "").slice(0, 300);
    if (!many.length && !sentence.trim()) return json({ error: "sentence가 필요합니다" }, 400);
    const ko = String(body?.ko ?? "").slice(0, 300);

    const userMsg = many.length
      ? `아래 문장들을 각각 분해해 results 배열로, 받은 순서 그대로 출력하세요.\n\n${many
          .map((s, i) => `${i + 1}. ${s}`)
          .join("\n")}`
      : `문장: ${sentence}${ko ? `\n한국어 뜻: ${ko}` : ""}\n\n이 문장을 분해해 JSON으로 출력하세요.`;

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
        // 기계적인 분해라 깊게 생각할 필요가 없다 — 비용·지연을 아낀다
        output_config: { effort: "low" },
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!res.ok) {
      return json({ error: `Anthropic ${res.status}: ${await res.text()}` }, 502);
    }

    const data = await res.json();
    if (data.stop_reason === "refusal") return json({ error: "분해할 수 없는 문장이에요." }, 502);

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
