// Supabase Edge Function — 단어 시험의 '문맥 빈칸(cloze)' 문제를 Claude로 배치 생성한다.
//
// 배포:  npx supabase functions deploy generate-quiz --project-ref auvcrexjkoxvymzytlxp --use-api
//        (JWT 검증 ON — 로그인 사용자만. tutor-chat 과 동일)
// 비밀키: ANTHROPIC_API_KEY (기존 공유)
//
// 요청:  POST { words: [{ kanji, kana, meaning, level, pos }, ...] }   (대상 단어들)
// 응답:  { questions: [{ sentence, ko, choices[4], answerIndex, answerKanji }] }
//        sentence 는 대상 단어를 "＿＿" 로 가린 일본어 문장.

const MODEL = "claude-sonnet-5"; // 속도·비용 우선 (문장 생성엔 충분)
const MAX_TOKENS = 8000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InWord {
  kanji: string;
  kana: string;
  meaning: string;
  level: string;
  pos: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          answerKanji: { type: "string", description: "이 문제의 정답 표제어(주어진 그대로)" },
          sentence: { type: "string", description: "정답 단어를 ＿＿로 가린 일본어 문장" },
          ko: { type: "string", description: "문장 전체의 한국어 뜻" },
          choices: {
            type: "array",
            items: { type: "string" },
            minItems: 4,
            maxItems: 4,
            description: "빈칸에 들어갈 후보 4개(정답 1 + 오답 3), 같은 활용형·품사",
          },
          answerIndex: { type: "integer", description: "choices 중 정답 위치(0~3)" },
        },
        required: ["answerKanji", "sentence", "ko", "choices", "answerIndex"],
      },
    },
  },
  required: ["questions"],
};

function prompt(words: InWord[]): string {
  const list = words
    .map((w, i) => `${i + 1}. ${w.kanji} (${w.kana}) = ${w.meaning} [${w.level}·${w.pos}]`)
    .join("\n");
  return `당신은 JLPT 어휘 시험 출제자입니다. 아래 각 단어로 **문맥 빈칸(문맥규정) 문제**를 하나씩, 순서대로 만드세요.

규칙:
- 각 단어를 자연스럽게 쓴 짧은 일본어 문장을 만든 뒤, 그 단어가 있던 자리를 **＿＿** 로 가립니다(문장에 ＿＿ 정확히 한 번).
- 문장 난이도는 해당 급수 학습자가 이해할 수준. 한자+가나로 표기.
- choices: 빈칸에 들어갈 후보 4개. 정답 1개 + **문맥상 틀린** 오답 3개. 오답은 같은 품사·비슷한 난이도라 헷갈리되, 그 문장엔 의미가 안 맞아야 함. 4개 모두 **빈칸에 문법적으로 들어갈 수 있는 같은 형태**로.
- answerIndex 는 choices에서 정답 위치. 정답의 위치는 문제마다 무작위로 섞으세요.
- answerKanji 는 주어진 표제어 그대로.
- ko 는 문장 전체의 자연스러운 한국어 뜻(빈칸은 정답 단어로 채운 상태의 뜻).
- 반드시 주어진 단어 **모든 개수만큼**, 같은 순서로 출력.

단어 목록(${words.length}개):
${list}`;
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
    const raw: unknown = body?.words;
    if (!Array.isArray(raw) || raw.length === 0) {
      return json({ error: "words 가 필요합니다" }, 400);
    }
    const words: InWord[] = raw
      .filter(
        (w): w is InWord =>
          !!w && typeof w.kanji === "string" && typeof w.kana === "string" &&
          typeof w.meaning === "string",
      )
      .slice(0, 16)
      .map((w) => ({
        kanji: w.kanji,
        kana: w.kana,
        meaning: w.meaning,
        level: String(w.level ?? ""),
        pos: String(w.pos ?? ""),
      }));
    if (!words.length) return json({ error: "유효한 단어가 없습니다" }, 400);

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
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: prompt(words) }],
      }),
    });
    if (!res.ok) {
      return json({ error: `Anthropic ${res.status}: ${await res.text()}` }, 502);
    }
    const data = await res.json();
    const text = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
    let parsed: { questions?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: "생성 결과 파싱 실패" }, 502);
    }
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    return json({ questions });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
