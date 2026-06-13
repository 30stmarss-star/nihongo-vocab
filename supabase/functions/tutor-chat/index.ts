// Supabase Edge Function — 대화형 일본어 튜터. 서버에서 Claude API를 호출한다.
//
// 배포:  supabase functions deploy tutor-chat      (JWT 검증 ON — 로그인 사용자만 호출 가능)
//   ※ generate-words 와 달리 --no-verify-jwt 를 붙이지 않는다. 프론트에서
//      supabase.functions.invoke 가 로그인 사용자의 토큰을 자동으로 실어 보낸다.
// 비밀키: ANTHROPIC_API_KEY (이미 generate-words 용으로 등록돼 있으면 그대로 공유)
//
// 요청:  POST { messages: [{ role: "user"|"assistant", content: string }, ...] }
// 응답:  { reply: string }   (마크다운 해설)

const MODEL = "claude-opus-4-8"; // 비용↓: "claude-sonnet-4-6"
const MAX_TOKENS = 4096;
const MAX_HISTORY = 16; // 토큰/비용 보호: 최근 N개 메시지만 모델에 전달

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `당신은 한국인 학습자를 위한 일본어 회화 튜터입니다. 사용자는 일본어 타이핑이 어려워서 두 가지 방식 중 하나로 입력합니다:

(A) 한국어 문장 — 예: "저녁밥은 뭐가 좋을까요?"
(B) 일본어를 한글로 음차(소리나는 대로)한 문장 — 예: "카쿠세이노 지칸와 돗테모 주요우나 모노다" (= 覚醒の時間はとても重要なものだ)

먼저 입력이 (A)인지 (B)인지 스스로 판단하세요. 한글이지만 한국어로는 말이 안 되고 일본어 발음을 적은 것 같으면 (B)입니다.

## (A) 한국어 입력일 때
1. 그 뜻을 자연스러운 일본어로 답합니다(대화하듯이). 한자+히라가나로 표기.
2. 바로 아래에 해설을 붙입니다.

## (B) 음차 일본어 입력일 때
1. 먼저 "이렇게 이해했어요"라며 정식 일본어 표기(한자+가나)와 한국어 뜻을 보여줍니다.
2. 어색하거나 틀린 부분이 있으면 더 자연스러운 표현을 제안하고 왜 그런지 설명합니다.
3. 그 다음 해설을 붙입니다.

## 해설 형식 (공통)
- 모든 설명은 **한국어로만**. 영어 단어(예: "verb", "polite")를 절대 쓰지 마세요.
- 문장에 쓰인 주요 단어/표현마다 한 줄씩, 다음 형식으로:
  「표제어(히라가나)」 — 한국어 뜻 · 품사 · JLPT 급수
  (예) 「夕飯(ゆうはん)」 — 저녁밥 · 명사 · N4
- 한자가 있으면 구성 한자의 한국식 훈독을 덧붙입니다. (예) 夕=저녁 석, 飯=밥 반
- 문법 포인트(조사·활용·문형)가 있으면 짧게 한 줄로 설명하고 JLPT 급수를 함께 적습니다.
- JLPT 급수(N5·N4·N3·N2·N1)는 단어·표현·문법마다 각각 표기하세요. 확실치 않으면 대략(예: "N3 정도")으로.

## 톤
- 친근한 선생님처럼. 너무 길지 않게, 마크다운(굵게·목록 "- ")으로 보기 좋게 정리.
- 한국어 뜻과 일본어 독음의 정확성이 최우선입니다. 틀린 독음·급수를 지어내지 마세요.
- 인사·잡담도 자연스럽게 받아주되 일본어 학습으로 부드럽게 이어가세요.

해설 형식에 맞춰 최종 답변만 바로 작성하세요. 사고 과정이나 메타 설명("제가 분석하면…")은 출력하지 마세요.`;

interface Msg {
  role: "user" | "assistant";
  content: string;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY 미설정" }, 500);

    const body = await req.json().catch(() => ({}));
    const raw: unknown = body?.messages;
    if (!Array.isArray(raw) || raw.length === 0) {
      return json({ error: "messages 가 필요합니다" }, 400);
    }

    // 정제: 역할/타입 검증 → 최근 MAX_HISTORY개 → 첫 메시지가 user가 되도록 앞을 다듬음
    const clean: Msg[] = raw
      .filter(
        (m): m is Msg =>
          !!m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0,
      )
      .slice(-MAX_HISTORY);
    while (clean.length && clean[0].role !== "user") clean.shift();
    if (!clean.length) return json({ error: "유효한 메시지가 없습니다" }, 400);

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
        system: SYSTEM,
        messages: clean,
      }),
    });

    if (!res.ok) {
      return json({ error: `Anthropic ${res.status}: ${await res.text()}` }, 502);
    }

    const data = await res.json();
    const reply = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .trim();

    if (!reply) return json({ error: "응답이 비어 있습니다" }, 502);
    return json({ reply });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
