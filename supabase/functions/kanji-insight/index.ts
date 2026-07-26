// Supabase Edge Function — 한자 자세히 배우기. 단어에 쓰인 한자를 즉석 분석한다.
//
// 배포:  supabase functions deploy kanji-insight   (JWT 검증 ON)
// 비밀키: ANTHROPIC_API_KEY (기존 함수들과 공유)
//
// 요청:  POST { word: { kanji, kana, meaning, level } }
// 응답:  { chars: [{char, korean, type, origin, parts, reading, related[]}], note }

const MODEL = "claude-opus-5";
const MAX_TOKENS = 6000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `당신은 한국인 학습자에게 한자의 '자원(字源)'을 풀어주는 선생님입니다. 일본어 단어에 쓰인 한자를 한 글자씩 분석해, 왜 그런 모양이고 왜 그런 뜻이 됐는지 이야기하듯 설명합니다.

## 글자마다 담을 내용
- korean: 한국식 훈독 (예: "먹을 식")
- type: 만들어진 원리 — "상형"(그림) / "지사"(기호) / "회의"(뜻+뜻) / "형성"(뜻+소리) 중 하나
- origin: 어원·유래. 갑골문·금문에서 무엇을 그린 그림이었고 어떻게 지금 모양이 됐는지, 기억에 남게 2~3문장.
- parts: 글자를 이루는 부수·요소 분해. (예) "食(밥 식) + 反(되돌릴 반) → 反이 '한'이라는 소리를 담당"
- reading: 일본어 음독·훈독을 한국 한자음과 연결. (예) "음독 ショク — 한국음 '식'과 같은 뿌리. 훈독 た(べる)"
- related: 이 한자가 들어간 다른 일본어 단어 2~3개. 각 항목은 "漢字(독음) 뜻" 형식.

## note (전체 총평)
글자들이 합쳐져 왜 그 단어 뜻이 되는지 한두 문장. 한 글자짜리 단어면 그 글자가 일본어에서 어떻게 쓰이는지.

## 규칙
- 모든 설명은 **한국어로만**. 영어 단어를 쓰지 마세요.
- 학술 용어를 늘어놓지 말고, 그림이 떠오르게 구체적으로.
- 확실하지 않은 어원은 지어내지 말고 "설이 갈린다"고 밝히세요.
- 가나(히라가나·가타카나)만으로 된 단어면 chars는 빈 배열로 두고 note에 그 단어의 유래나 쓰임을 설명하세요.

## 출력 — 반드시 JSON 하나만 (앞뒤 다른 텍스트 금지)
{"chars":[{"char":"食","korean":"먹을 식","type":"상형","origin":"...","parts":"...","reading":"...","related":["飲食(いんしょく) 음식"]}],"note":"..."}`;

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

/** 모델 출력에서 첫 JSON 오브젝트를 뽑는다 (앞뒤 잡담 방어) */
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
    const word = body?.word as
      | { kanji?: string; kana?: string; meaning?: string; level?: string }
      | undefined;
    if (!word?.kanji) return json({ error: "word가 필요합니다" }, 400);

    const userMsg = `단어: ${word.kanji}\n독음: ${word.kana ?? ""}\n뜻: ${word.meaning ?? ""}\n급수: ${word.level ?? ""}\n\n이 단어에 쓰인 한자를 한 글자씩 분석해 JSON으로 출력하세요.`;

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
        // 짧은 설명 하나라 깊게 생각할 필요는 없다 (max_tokens는 사고+본문 합산)
        output_config: { effort: "medium" },
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!res.ok) {
      return json({ error: `Anthropic ${res.status}: ${await res.text()}` }, 502);
    }

    const data = await res.json();
    // 안전장치: 안전 분류기가 거절하면 content가 비어 있을 수 있다
    if (data.stop_reason === "refusal") {
      return json({ error: "이 단어는 설명을 만들 수 없었어요." }, 502);
    }
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
