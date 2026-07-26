import { useEffect, useMemo, useRef, useState } from "react";
import type { Word } from "../data/types";
import { boundPrefix } from "../data/types";
import { readingMatches } from "../lib/kana";
import { isKnown, isRetired, type ProgressMap } from "../lib/srs";
import type { ExamItem } from "../lib/daily";
import {
  conjugateQ,
  headword,
  meaningQ,
  readingQ,
  shuffle,
  typeQ,
  writingQ,
  type Question,
} from "../lib/quizgen";
import type { QuizResult } from "./Quiz";

/**
 * 데일리 시험 — 오늘의 단어를 여러 각도에서 묻는다.
 * 한 단어를 읽기로 한 번, 활용형으로 또 한 번 물으면 어중간하게 외운 건 걸러진다.
 *
 *  - 유형: 한자읽기 · 표기 · 뜻 · 활용형 · 독음타이핑(규칙 생성)
 *          + 문맥규정 · 유의표현 · 용법(LLM이 코스 시작 때 미리 생성)
 *  - 분량: 단어당 1.5문항. 어려워한 단어는 다른 유형으로 두 번 나온다.
 *  - 1차 점수(첫 시도)가 PASS_PCT 이상이어야 통과. 틀린 건 그 자리에서 재출제.
 */

const PASS_PCT = 90;

interface Props {
  words: Word[]; // 오늘의 단어 전체
  bandWords: Word[]; // 오답 보기 생성용
  progress: ProgressMap; // 어려움/쉬움 판정용
  examItems?: ExamItem[]; // 미리 만들어 둔 문장형 문항
  onApplyResults: (results: QuizResult[]) => void; // 1차 결과만 SRS 반영
  onPassed: (score: number) => void;
  onExit: () => void;
}

/** 이 단어를 아직 어려워하는가 (어려움 = 문항 2개) */
const isHard = (w: Word, p: ProgressMap) => !isRetired(p[w.id]) && !isKnown(p[w.id]);

/** 문장형 문항을 화면용 Question으로 */
function toQuestion(item: ExamItem, w: Word): Question {
  const base = { word: w, sentence: item.sentence, ko: item.ko, choices: item.choices, answer: item.answerIndex };
  if (item.kind === "usage") return { kind: "usage", word: w, choices: item.choices, answer: item.answerIndex };
  return item.kind === "cloze" ? { kind: "cloze", ...base } : { kind: "synonym", ...base };
}

/**
 * 시험지 구성. 단어마다 서로 다른 유형을 뽑아 쓰고,
 * 어려운 단어에는 두 번째 유형을 하나 더 붙인다.
 */
function buildQuestions(
  words: Word[],
  pool: Word[],
  progress: ProgressMap,
  examItems: ExamItem[] | undefined
): Question[] {
  const byKanji = new Map<string, ExamItem[]>();
  for (const it of examItems ?? []) {
    const arr = byKanji.get(it.kanji) ?? [];
    arr.push(it);
    byKanji.set(it.kanji, arr);
  }

  const out: Question[] = [];
  for (const w of words) {
    // 이 단어로 만들 수 있는 문항 후보 (만들 수 없는 유형은 null로 빠진다)
    const sentence = (byKanji.get(w.kanji) ?? []).map((it) => toQuestion(it, w));
    const rule = [readingQ(w, pool), writingQ(w, pool), meaningQ(w, pool), conjugateQ(w)].filter(
      Boolean
    ) as Question[];
    const candidates = shuffle([...sentence, ...shuffle(rule)]);
    // 후보가 하나도 없으면(가나 단어 등) 타이핑 문제로
    if (!candidates.length) {
      out.push(typeQ(w));
      continue;
    }
    out.push(candidates[0]);
    // 어려운 단어는 다른 유형으로 한 번 더 — 없으면 타이핑으로
    if (isHard(w, progress)) {
      out.push(candidates[1] ?? typeQ(w));
    }
  }
  return shuffle(out);
}

export function DailyTest({
  words,
  bandWords,
  progress,
  examItems,
  onApplyResults,
  onPassed,
  onExit,
}: Props) {
  const [phase, setPhase] = useState<"intro" | "quiz" | "drill" | "result">("intro");
  const [qs, setQs] = useState<Question[]>([]);
  const [cur, setCur] = useState(0);
  const [input, setInput] = useState("");
  // 즉시 피드백: null=답 대기, 아니면 채점 결과 표시 중
  const [judged, setJudged] = useState<{ ok: boolean; picked?: number } | null>(null);
  const firstTry = useRef<Map<string, boolean>>(new Map()); // 단어별 첫 시도 결과
  const [wrongQueue, setWrongQueue] = useState<Question[]>([]);
  const applied = useRef(false);
  const passedFired = useRef(false);

  // 점수는 '단어 기준' — 한 단어를 두 번 물었으면 둘 다 맞아야 그 단어를 안 것으로 본다
  const score = useMemo(() => {
    if (!words.length) return 0;
    let ok = 0;
    for (const w of words) if (firstTry.current.get(w.id)) ok++;
    return Math.round((ok / words.length) * 100);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    firstTry.current = new Map();
    applied.current = false;
    setQs(buildQuestions(words, bandWords, progress, examItems));
    setWrongQueue([]);
    setCur(0);
    setInput("");
    setJudged(null);
    setPhase("quiz");
  }

  const list = phase === "drill" ? wrongQueue : qs;
  const q = list[cur];

  function judge(picked?: number) {
    if (!q || judged) return;
    const ok = q.kind === "type" ? readingMatches(input, q.word.kana, q.word.kanji) : picked === q.answer;

    if (phase === "quiz") {
      // 같은 단어를 여러 번 물으면 '전부 맞아야' 아는 것으로 친다
      const prev = firstTry.current.get(q.word.id);
      firstTry.current.set(q.word.id, prev === undefined ? ok : prev && ok);
    }

    if (!ok) {
      setWrongQueue((p) => (phase === "quiz" ? [...p, q] : [...p.slice(0, cur), ...p.slice(cur + 1), q]));
    } else if (phase === "drill") {
      setWrongQueue((p) => [...p.slice(0, cur), ...p.slice(cur + 1)]);
    }
    setJudged({ ok, picked });
  }

  function next() {
    setJudged(null);
    setInput("");
    if (phase === "quiz") {
      if (cur + 1 < qs.length) {
        setCur(cur + 1);
      } else {
        if (!applied.current) {
          applied.current = true;
          onApplyResults(words.map((w) => ({ id: w.id, correct: !!firstTry.current.get(w.id) })));
        }
        if (wrongQueue.length) {
          setCur(0);
          setPhase("drill");
        } else {
          setPhase("result");
        }
      }
    } else if (judged?.ok && wrongQueue.length === 0) {
      setPhase("result");
    } else {
      setCur(0);
    }
  }

  const passed = score >= PASS_PCT;
  useEffect(() => {
    if (phase === "result" && passed && !passedFired.current) {
      passedFired.current = true;
      onPassed(score);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, passed]);

  // ── 인트로 ──
  if (phase === "intro") {
    const hardCount = words.filter((w) => isHard(w, progress)).length;
    return (
      <div className="mx-auto max-w-md px-5 pt-4">
        <button onClick={onExit} aria-label="나가기" className="grid h-9 w-9 place-items-center rounded-full bg-card text-sub shadow-soft">
          ✕
        </button>
        <div className="mt-6 rounded-3xl bg-card p-7 text-center shadow-pop">
          <div className="text-4xl">📝</div>
          <h2 className="mt-3 text-xl font-extrabold text-ink">데일리 시험</h2>
          <p className="mt-3 text-sm leading-relaxed text-sub">
            오늘 학습한 <b className="text-ink">{words.length}단어</b>를 여러 각도로 물어요.
            <br />
            한자 읽기 · 표기 · 뜻 · 활용형 · 문맥 · 유의 표현 · 용법
            {hardCount > 0 && (
              <>
                <br />
                어려워한 <b className="text-coral">{hardCount}단어</b>는 두 번 나와요.
              </>
            )}
            <br />
            <b className="text-pri-deep">{PASS_PCT}점 이상</b>이면 통과!
          </p>
          {!examItems?.length && (
            <p className="mt-3 text-xs text-mut">문장형 문제는 아직 준비 중이라 단어 문제 위주로 나와요.</p>
          )}
          <button
            onClick={start}
            className="mt-6 w-full rounded-2xl bg-pri py-3.5 font-bold text-white shadow-soft transition hover:bg-pri-deep active:scale-95"
          >
            시험 시작
          </button>
        </div>
      </div>
    );
  }

  // ── 결과 ──
  if (phase === "result") {
    const wrongWords = words.filter((w) => !firstTry.current.get(w.id));
    return (
      <div className="mx-auto max-w-md px-5 pb-10 pt-4">
        <div className="rounded-3xl bg-card p-7 text-center shadow-pop">
          <ScoreRing pct={score} good={passed} />
          <h2 className="mt-4 text-xl font-extrabold text-ink">
            {passed ? "통과! 오늘 목표 달성 🎉" : "아쉬워요, 한 번 더!"}
          </h2>
          <p className="mt-2 text-sm text-sub">
            {passed
              ? "틀렸던 단어는 복습 목록으로 돌아갔어요. 내일 또 만나요."
              : `${PASS_PCT}점 이상이어야 통과예요. 오답을 다졌으니 바로 다시 도전!`}
          </p>
          <div className="mt-5 flex justify-center gap-6 text-center">
            <div>
              <div className="text-2xl font-extrabold text-mint">{words.length - wrongWords.length}</div>
              <div className="text-xs text-mut">맞음</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-coral">{wrongWords.length}</div>
              <div className="text-xs text-mut">틀림</div>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            {!passed && (
              <button
                onClick={start}
                className="flex-1 rounded-2xl bg-pri py-3.5 font-bold text-white shadow-soft transition hover:bg-pri-deep active:scale-95"
              >
                재시험 보기
              </button>
            )}
            <button
              onClick={onExit}
              className={[
                "rounded-2xl py-3.5 font-bold shadow-soft transition active:scale-95",
                passed ? "flex-1 bg-pri text-white hover:bg-pri-deep" : "bg-card px-5 text-sub",
              ].join(" ")}
            >
              {passed ? "홈으로" : "나중에"}
            </button>
          </div>
        </div>

        {wrongWords.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-3xl bg-card shadow-soft">
            <div className="border-b border-line px-5 py-3 text-sm font-bold text-ink">틀린 단어</div>
            <ul>
              {wrongWords.map((w) => (
                <li key={w.id} className="flex items-baseline gap-2 border-b border-line px-5 py-2.5 last:border-0">
                  <span className="font-bold text-ink">{headword(w)}</span>
                  <span className="text-sm text-pri">{w.kana}</span>
                  <span className="ml-auto text-sm text-sub">{w.meaning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ── 문제 풀이 ──
  if (!q) return null;

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-5 pb-8 pt-4">
      <div className="flex items-center gap-3">
        <button onClick={onExit} aria-label="나가기" className="grid h-9 w-9 place-items-center rounded-full bg-card text-sub shadow-soft">
          ✕
        </button>
        {phase === "quiz" ? (
          <>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-card shadow-inner">
              <div
                className="h-full rounded-full bg-pri transition-all duration-300"
                style={{ width: `${((cur + (judged ? 1 : 0)) / qs.length) * 100}%` }}
              />
            </div>
            <span className="w-14 text-right text-sm font-semibold text-sub">
              {cur + 1}/{qs.length}
            </span>
          </>
        ) : (
          <div className="flex-1 text-center text-sm font-bold text-coral">
            🔁 오답 다지기 — {wrongQueue.length}개 남음
          </div>
        )}
      </div>

      <div className="mt-6 grow">
        <div key={`${phase}-${cur}-${q.word.id}-${q.kind}`} className="animate-[cardIn_0.2s_ease-out] rounded-3xl bg-card p-6 shadow-pop">
          <Prompt q={q} />
          {q.kind === "type" ? (
            <>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim() && !judged) judge();
                }}
                disabled={!!judged}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="off"
                placeholder="예: にる 또는 니루"
                className="mt-5 w-full rounded-2xl border-2 border-line bg-base px-4 py-3.5 text-lg text-ink outline-none transition focus:border-pri"
              />
              {!judged && (
                <button
                  onClick={() => judge()}
                  disabled={!input.trim()}
                  className="mt-4 w-full rounded-2xl bg-pri py-3 font-bold text-white transition hover:bg-pri-deep active:scale-95 disabled:opacity-40"
                >
                  확인
                </button>
              )}
            </>
          ) : (
            <div className={["mt-5 grid gap-2.5", q.kind === "usage" ? "" : "sm:grid-cols-2"].join(" ")}>
              {q.choices.map((c, i) => {
                const state = !judged
                  ? "idle"
                  : i === q.answer
                    ? "correct"
                    : judged.picked === i
                      ? "wrong"
                      : "dim";
                return (
                  <button
                    key={i}
                    disabled={!!judged}
                    onClick={() => judge(i)}
                    className={[
                      "rounded-2xl border-2 px-4 py-3 text-left font-semibold leading-relaxed transition active:scale-[0.98]",
                      q.kind === "usage" ? "text-sm" : "text-base",
                      state === "idle" && "border-line bg-card text-ink hover:border-pri/60 hover:bg-pri-soft/40",
                      state === "correct" && "border-mint bg-mint-soft text-ink",
                      state === "wrong" && "border-coral bg-coral-soft text-ink",
                      state === "dim" && "border-line bg-card text-mut",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {judged && (
          <div
            className={[
              "mt-4 animate-[popIn_0.2s_ease-out] rounded-3xl p-5 shadow-soft",
              judged.ok ? "bg-mint-soft" : "bg-coral-soft",
            ].join(" ")}
          >
            <div className={["text-base font-extrabold", judged.ok ? "text-mint" : "text-coral"].join(" ")}>
              {judged.ok ? "정답! ⭕" : "틀렸어요 ✕"}
            </div>
            <div className="mt-1.5 text-sm text-ink">
              <b>{headword(q.word)}</b>
              {q.word.kanji !== q.word.kana && <span className="ml-2 text-pri-deep">{q.word.kana}</span>}
              <span className="ml-2 text-sub">{q.word.meaning}</span>
            </div>
            {"ko" in q && q.ko && <div className="mt-1 text-xs text-sub">{q.ko}</div>}
            {q.kind === "conjugate" && (
              <div className="mt-1 text-xs text-sub">
                {q.label} — {q.hint}
              </div>
            )}
            {/* 다른 보기들도 무슨 단어였는지 알려준다 — 헷갈린 짝을 같이 정리하게 */}
            {q.kind !== "type" && (
              <ChoiceGlossary q={q} picked={judged.picked} dictionary={bandWords} />
            )}
          </div>
        )}
      </div>

      {judged && (
        <button
          onClick={next}
          className={[
            "mt-5 w-full rounded-2xl py-3.5 font-bold text-white shadow-soft transition active:scale-95",
            judged.ok ? "bg-mint hover:brightness-105" : "bg-coral hover:brightness-105",
          ].join(" ")}
        >
          계속 →
        </button>
      )}
    </div>
  );
}

/**
 * 오답 보기 풀이. 보기 하나하나가 무슨 단어였는지 사전에서 찾아 붙인다.
 * 「厳しい」를 고르려다 「優しい」를 골랐다면 그 둘을 같이 정리해야 다음에 안 틀린다.
 */
function ChoiceGlossary({
  q,
  picked,
  dictionary,
}: {
  q: Exclude<Question, { kind: "type" }>;
  picked?: number;
  dictionary: Word[];
}) {
  const index = useMemo(() => {
    const m = new Map<string, Word>();
    for (const w of dictionary) {
      if (!m.has(w.kanji)) m.set(w.kanji, w);
      if (!m.has(w.kana)) m.set(w.kana, w);
    }
    return m;
  }, [dictionary]);

  // 용법 문제는 보기가 통문장이라 단어 풀이가 의미 없다
  if (q.kind === "usage") return null;

  const rows = q.choices
    .map((c, i) => ({ c, i, w: index.get(c) }))
    .filter((r) => r.w && r.i !== q.answer);
  if (!rows.length) return null;

  return (
    <div className="mt-3 border-t border-ink/10 pt-2.5">
      <div className="text-[11px] font-bold text-mut">다른 보기</div>
      <ul className="mt-1 space-y-1">
        {rows.map(({ c, i, w }) => (
          <li key={i} className="flex items-baseline gap-1.5 text-xs">
            <span className={["font-bold", i === picked ? "text-coral" : "text-ink"].join(" ")}>{c}</span>
            {w!.kanji !== w!.kana && c !== w!.kana && <span className="text-pri-deep">{w!.kana}</span>}
            <span className="text-sub">{w!.meaning}</span>
            {i === picked && <span className="ml-auto text-[10px] font-bold text-coral">내가 고른 답</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 유형별 문제 제시부 */
function Prompt({ q }: { q: Question }) {
  const label = (t: string) => (
    <div className="text-xs font-bold uppercase tracking-wide text-mut">{t}</div>
  );

  switch (q.kind) {
    case "reading":
      return (
        <>
          {label("독음을 고르세요")}
          <div className="mt-2 text-4xl font-bold text-ink">{headword(q.word)}</div>
        </>
      );
    case "writing":
      return (
        <>
          {label("한자 표기를 고르세요")}
          <div className="mt-2 text-3xl font-bold text-ink">{boundPrefix(q.word) + q.word.kana}</div>
        </>
      );
    case "meaning":
      return (
        <>
          {label("뜻을 고르세요")}
          <div className="mt-2 text-3xl font-bold text-ink">{headword(q.word)}</div>
        </>
      );
    case "conjugate":
      return (
        <>
          {label(`${q.label}을(를) 고르세요`)}
          <div className="mt-2 text-3xl font-bold text-ink">{headword(q.word)}</div>
          <div className="mt-1 text-sm text-sub">{q.hint}</div>
        </>
      );
    case "cloze":
      return (
        <>
          {label("빈칸에 알맞은 단어")}
          <div className="mt-2 text-xl font-bold leading-relaxed text-ink">{q.sentence}</div>
        </>
      );
    case "synonym":
      return (
        <>
          {label("【 】와 바꿔 쓸 수 있는 말")}
          <div className="mt-2 text-xl font-bold leading-relaxed text-ink">{q.sentence}</div>
        </>
      );
    case "usage":
      return (
        <>
          {label("이 단어가 올바르게 쓰인 문장")}
          <div className="mt-2 text-3xl font-bold text-ink">{headword(q.word)}</div>
        </>
      );
    case "type":
      return (
        <>
          {label("독음 입력")}
          <div className="mt-2 text-3xl font-bold text-ink">{q.word.meaning}</div>
          <div className="mt-1 text-xs text-mut">히라가나·한국어 발음 모두 인정</div>
        </>
      );
  }
}

/** 점수 링 (결과 화면) */
function ScoreRing({ pct, good }: { pct: number; good: boolean }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative mx-auto h-32 w-32">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-base)" strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={good ? "var(--color-pri)" : "var(--color-coral)"}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct / 100)}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div>
          <div className={["text-3xl font-extrabold", good ? "text-pri-deep" : "text-coral"].join(" ")}>{pct}</div>
          <div className="text-center text-xs font-semibold text-mut">점</div>
        </div>
      </div>
    </div>
  );
}
