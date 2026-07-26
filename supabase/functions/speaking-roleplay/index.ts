// Supabase Edge Function — 작문 스피킹(상황 롤플레이) 코치.
//
// 배포:  supabase functions deploy speaking-roleplay   (JWT 검증 ON)
// 비밀키: ANTHROPIC_API_KEY (기존 함수들과 공유)
//
// 하루 코스의 작문 단계: 상황(편의점·식당…) 하나를 4턴 대화로 진행하고,
// 내 대사와 상대방 대사를 '둘 다' 사용자가 한글 음차로 작문한다.
//
// 요청 (mode: "start"):
//   { mode, scenario: {title, desc}, level, focusWords: [{jp,kana,ko}] }
//   → { intro, instruction }        (첫 지시. 첫 역할은 항상 "me")
// 요청 (mode: "answer"):
//   { mode, scenario, level, focusWords, history: [...], role, instruction,
//     input, nextRole: "me"|"partner"|null }
//   → { understood, verdict, correctJp, correctKana, correctKo, feedback,
//       nextInstruction }           (nextRole가 null이면 nextInstruction도 null)

const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 3000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `당신은 한국인 학습자를 위한 일본어 '스피킹 작문' 코치입니다. 주어진 상황(예: 편의점)을 4턴짜리 실전 대화로 진행합니다. 특별한 점: 학습자가 손님 대사와 점원(상대방) 대사를 번갈아 '둘 다' 작문합니다. 학습자는 일본어 타이핑이 어려워 일본어를 한글 음차(소리나는 대로)로 입력합니다. 예: "스미마셍, 코레 쿠다사이" (= すみません、これください)

## 지시문(instruction) 작성 규칙
- 한국어로, 무엇을 일본어로 말할지 상황을 지시합니다. 정답 문장을 직접 알려주지 않습니다.
  (예) role=me: "점원에게 이 도시락을 데워달라고 부탁해보세요."
  (예) role=partner: "이번엔 점원 입장! 데워드리겠다며 잠시 기다려달라고 답해보세요."
- 대화가 자연스럽게 이어지도록 직전 대사들을 반영하세요.
- 학습자 레벨에 맞는 난이도로. 집중 단어(focusWords)가 있으면 자연스러운 자리에 1~2개씩 녹여 지시하세요(억지로 넣지 않기).

## 채점(verdict) 규칙 — 관대하게
- 한글 음차는 발음이 '적당히 비슷하면' 인정합니다 (촉음·장음·탁음 흔들림 허용).
- verdict: "great"(자연스럽고 정확) / "ok"(뜻은 통함, 다듬을 점 있음) / "retry"(뜻이 전달되지 않음)
- 학습자가 한국어 뜻만 쓴 경우(일본어 시도가 아님)는 retry로 하고 feedback에서 일본어로 말해보도록 안내.

## feedback 작성 규칙 (마크다운, 전부 한국어 — 영어 금지)
1. **이렇게 들렸어요**: 학습자 입력을 정식 일본어 표기(한자+가나)로 복원 + 한국어 뜻.
2. **모범 답안**: 가장 자연스러운 문장 (정식 표기, 히라가나 독음, 한글 발음).
3. **실전 팁**: 원어민이 실제로 더 자주 쓰는 표현·뉘앙스 차이 1~2개.
4. **문법 분해**: 문장 속 조사·활용·문형을 한 줄씩 (「표현」 — 설명 · JLPT 급수).
- 잘한 부분은 짧게 칭찬하고, 고칠 부분만 콕 집어서. 너무 길지 않게.

## 상황(scenario) 창작 규칙 (mode=start에서 상황이 주어지지 않았을 때)
- 일본 여행·일상에서 실제로 겪을 법한 회화 상황을 하나 창작합니다. (가게, 교통, 숙소, 병원, 관공서, 대화, 부탁, 문제 해결 등 폭넓게)
- '최근에 나온 상황' 목록과 겹치지 않는 새로운 것으로.
- title은 2~6글자의 짧은 한국어, emoji는 어울리는 이모지 1개, desc는 대화가 어떻게 흘러갈지 한 문장.

## 출력 형식 — 반드시 JSON 하나만 출력 (앞뒤 다른 텍스트 금지)
mode=start:
{"scenario":{"emoji":"🏪","title":"(짧은 제목)","desc":"(상황 설명 한 문장)"},"intro":"(상황을 여는 한 줄, 한국어)","instruction":"(첫 지시, role=me)"}
(상황이 주어진 경우에도 scenario 필드에 그대로 담아 출력)
mode=answer:
{"understood":"(정식 일본어 복원)","verdict":"great|ok|retry","correctJp":"(모범 답안 일본어)","correctKana":"(모범 답안 히라가나)","correctKo":"(모범 답안 한글 발음)","feedback":"(위 규칙의 마크다운)","nextInstruction":"(다음 지시. nextRole가 null이면 null)"}`;

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

interface Turn {
  role: "me" | "partner";
  instruction: string;
  input?: string;
  correctJp?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY 미설정" }, 500);

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode as "scenario" | "start" | "answer";
    const scenario = body?.scenario as { title: string; desc: string } | null;
    if (!mode) return json({ error: "mode가 필요합니다" }, 400);
    if (mode === "answer" && !scenario?.title) return json({ error: "scenario가 필요합니다" }, 400);

    const level = typeof body?.level === "string" ? body.level : "N5·N4";
    const focus: Array<{ jp: string; kana: string; ko: string }> = Array.isArray(body?.focusWords)
      ? body.focusWords.slice(0, 4)
      : [];

    const focusTxt = focus.length
      ? `\n집중 단어(오늘 배운 것 — 자연스러우면 지시에 녹이기): ${focus
          .map((f) => `${f.jp}(${f.kana}, ${f.ko})`)
          .join(", ")}`
      : "";

    let userMsg: string;
    if (mode === "scenario") {
      // 새 코스가 시작될 때 상황만 미리 창작한다 (대화는 나중에 start로)
      const recent: string[] = Array.isArray(body?.recent)
        ? body.recent.filter((t: unknown) => typeof t === "string").slice(-20)
        : [];
      userMsg = `새로운 회화 상황을 하나만 창작하세요. 최근에 나온 상황(겹치지 않게): ${recent.join(", ") || "없음"}\n학습자 레벨: ${level}\n\n다음 형식의 JSON만 출력하세요:\n{"scenario":{"emoji":"(이모지 1개)","title":"(2~6글자 제목)","desc":"(상황 설명 한 문장)"}}`;
    } else if (mode === "start") {
      const recent: string[] = Array.isArray(body?.recent)
        ? body.recent.filter((t: unknown) => typeof t === "string").slice(-20)
        : [];
      const scenarioTxt = scenario?.title
        ? `상황: ${scenario.title} — ${scenario.desc}`
        : `상황: 직접 창작하세요. 최근에 나온 상황(겹치지 않게): ${recent.join(", ") || "없음"}`;
      userMsg = `${scenarioTxt}\n학습자 레벨: ${level}${focusTxt}\n\n대화를 시작합니다. mode=start JSON을 출력하세요(scenario 필드 포함). 첫 지시는 role=me(손님/학습자 본인)입니다.`;
    } else {
      const history: Turn[] = Array.isArray(body?.history) ? body.history : [];
      const role = body?.role === "partner" ? "partner" : "me";
      const instruction = String(body?.instruction ?? "");
      const input = String(body?.input ?? "").slice(0, 500);
      const nextRole = body?.nextRole === "me" || body?.nextRole === "partner" ? body.nextRole : null;
      if (!input.trim()) return json({ error: "input이 필요합니다" }, 400);

      const historyTxt = history
        .map(
          (t, i) =>
            `${i + 1}. [${t.role === "me" ? "나" : "상대"}] 지시: ${t.instruction}\n   학습자 입력: ${t.input ?? "-"}\n   확정 대사: ${t.correctJp ?? "-"}`
        )
        .join("\n");

      userMsg = `상황: ${scenario.title} — ${scenario.desc}\n학습자 레벨: ${level}${focusTxt}\n\n지금까지의 대화:\n${historyTxt || "(첫 턴)"}\n\n현재 턴 role=${role}\n현재 지시: ${instruction}\n학습자 입력(한글 음차): ${input}\n\n다음 턴 role: ${nextRole ?? "없음(마지막 턴)"}\nmode=answer JSON을 출력하세요.${nextRole ? ` nextInstruction은 role=${nextRole} 지시입니다.` : " nextInstruction은 null."}`;
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
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!res.ok) {
      return json({ error: `Anthropic ${res.status}: ${await res.text()}` }, 502);
    }

    const data = await res.json();
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
