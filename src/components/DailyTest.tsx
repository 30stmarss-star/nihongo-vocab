import { useEffect, useMemo, useRef, useState } from "react";
import type { Word } from "../data/types";
import { boundPrefix } from "../data/types";
import { readingMatches } from "../lib/kana";
import { meaningChoices, type QuizResult } from "./Quiz";

/**
 * 데일리 시험 — 오늘의 단어(새+복습) 전부 출제. 하루 코스의 관문.
 *  - 문항마다 즉시 채점(맞음/틀림 + 정답 표시).
 *  - 1차 점수(첫 시도 기준)가 PASS_PCT 이상이어야 통과.
 *  - 틀린 문항은 그 자리에서 큐에 다시 들어가 전부 맞을 때까지 반복(오답 다지기).
 *  - 1차 점수가 미달이면 오답 다지기 후 전체 재시험.
 */

const PASS_PCT = 90;

type Q =
  | { kind: "mc"; word: Word; choices: string[]; answer: number }
  | { kind: "type"; word: Word };

interface Props {
  words: Word[]; // 오늘의 단어 전체
  bandWords: Word[]; // 오답 보기 생성용
  onApplyResults: (results: QuizResult[]) => void; // 1차 결과만 SRS 반영
  onPassed: (score: number) => void;
  onExit: () => void;
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function buildQuestions(words: Word[], bandWords: Word[]): Q[] {
  // 40%는 뜻→독음 타이핑, 나머지는 단어→뜻 4지선다
  const shuffled = shuffle(words);
  const nType = Math.round(shuffled.length * 0.4);
  const qs: Q[] = shuffled.map((w, i) =>
    i < nType
      ? { kind: "type" as const, word: w }
      : { kind: "mc" as const, word: w, ...meaningChoices(w, bandWords) }
  );
  return shuffle(qs);
}

export function DailyTest({ words, bandWords, onApplyResults, onPassed, onExit }: Props) {
  const [phase, setPhase] = useState<"intro" | "quiz" | "drill" | "result">("intro");
  const [qs, setQs] = useState<Q[]>([]);
  const [cur, setCur] = useState(0);
  const [input, setInput] = useState("");
  // 즉시 피드백: null=답 대기, 아니면 채점 결과 표시 중
  const [judged, setJudged] = useState<{ ok: boolean; picked?: number } | null>(null);
  const firstTry = useRef<Map<string, boolean>>(new Map()); // 단어별 첫 시도 결과
  const [wrongQueue, setWrongQueue] = useState<Q[]>([]);
  const applied = useRef(false);
  const passedFired = useRef(false);

  const score = useMemo(() => {
    if (!words.length) return 0;
    let ok = 0;
    for (const w of words) if (firstTry.current.get(w.id)) ok++;
    return Math.round((ok / words.length) * 100);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    firstTry.current = new Map();
    applied.current = false;
    setQs(buildQuestions(words, bandWords));
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
    const ok =
      q.kind === "type"
        ? readingMatches(input, q.word.kana, q.word.kanji)
        : picked === q.answer;
    if (phase === "quiz" && !firstTry.current.has(q.word.id)) {
      firstTry.current.set(q.word.id, ok);
    }
    if (!ok) {
      // 틀린 문항은 큐 뒤로 다시 (다지기 단계에서도 반복)
      setWrongQueue((prev) => (phase === "quiz" ? [...prev, q] : [...prev.slice(0, cur), ...prev.slice(cur + 1), q]));
    } else if (phase === "drill") {
      setWrongQueue((prev) => [...prev.slice(0, cur), ...prev.slice(cur + 1)]);
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
        // 1차 종료: SRS 반영(1차 결과만)
        if (!applied.current) {
          applied.current = true;
          onApplyResults(
            words.map((w) => ({ id: w.id, correct: !!firstTry.current.get(w.id) }))
          );
        }
        if (wrongQueue.length) {
          setCur(0);
          setPhase("drill");
        } else {
          finish();
        }
      }
    } else {
      // drill: 큐에서 제거/회전된 상태. cur은 항상 0부터.
      if (judged?.ok) {
        if (wrongQueue.length === 0) finish();
        else setCur(0);
      } else {
        setCur(0);
      }
    }
  }

  function finish() {
    setPhase("result");
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
    return (
      <div className="mx-auto max-w-md px-5 pt-4">
        <button onClick={onExit} aria-label="나가기" className="grid h-9 w-9 place-items-center rounded-full bg-card text-sub shadow-soft">
          ✕
        </button>
        <div className="mt-6 rounded-3xl bg-card p-7 text-center shadow-pop">
          <div className="text-4xl">📝</div>
          <h2 className="mt-3 text-xl font-extrabold text-ink">데일리 시험</h2>
          <p className="mt-3 text-sm leading-relaxed text-sub">
            오늘 학습한 <b className="text-ink">{words.length}단어</b> 전부 나와요.
            <br />
            <b className="text-pri-deep">{PASS_PCT}점 이상</b>이면 통과!
            <br />
            틀린 문제는 그 자리에서 다시 나와요.
          </p>
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
              <div className="text-2xl font-extrabold text-mint">
                {words.filter((w) => firstTry.current.get(w.id)).length}
              </div>
              <div className="text-xs text-mut">맞음</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-coral">
                {words.filter((w) => !firstTry.current.get(w.id)).length}
              </div>
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
                passed ? "flex-1 bg-pri text-white hover:bg-pri-deep" : "px-5 bg-card text-sub",
              ].join(" ")}
            >
              {passed ? "홈으로" : "나중에"}
            </button>
          </div>
        </div>

        {/* 틀린 단어 복기 */}
        {words.some((w) => !firstTry.current.get(w.id)) && (
          <div className="mt-4 overflow-hidden rounded-3xl bg-card shadow-soft">
            <div className="border-b border-line px-5 py-3 text-sm font-bold text-ink">틀린 단어</div>
            <ul>
              {words
                .filter((w) => !firstTry.current.get(w.id))
                .map((w) => (
                  <li key={w.id} className="flex items-baseline gap-2 border-b border-line px-5 py-2.5 last:border-0">
                    <span className="font-bold text-ink">{boundPrefix(w) + w.kanji}</span>
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

  // ── 문제 풀이 (quiz/drill 공통) ──
  if (!q) return null;
  const total = phase === "quiz" ? qs.length : undefined;

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
                style={{ width: `${((cur + (judged ? 1 : 0)) / (total ?? 1)) * 100}%` }}
              />
            </div>
            <span className="w-12 text-right text-sm font-semibold text-sub">
              {cur + 1}/{total}
            </span>
          </>
        ) : (
          <div className="flex-1 text-center text-sm font-bold text-coral">
            🔁 오답 다지기 — {wrongQueue.length}개 남음
          </div>
        )}
      </div>

      <div className="mt-6 grow">
        <div key={`${phase}-${cur}-${q.word.id}`} className="animate-[cardIn_0.2s_ease-out] rounded-3xl bg-card p-6 shadow-pop">
          {q.kind === "mc" ? (
            <>
              <div className="text-xs font-bold uppercase tracking-wide text-mut">뜻을 고르세요</div>
              <div className="mt-2 text-3xl font-bold text-ink">{boundPrefix(q.word) + q.word.kanji}</div>
              <div className="mt-5 grid gap-2.5">
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
                        "rounded-2xl border-2 px-4 py-3 text-left text-sm font-semibold transition active:scale-[0.98]",
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
            </>
          ) : (
            <>
              <div className="text-xs font-bold uppercase tracking-wide text-mut">
                독음 입력 <span className="font-medium normal-case text-mut">(히라가나·한국어 발음 모두 OK)</span>
              </div>
              <div className="mt-2 text-3xl font-bold text-ink">{q.word.meaning}</div>
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
          )}
        </div>

        {/* 즉시 피드백 */}
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
              <b>{boundPrefix(q.word) + q.word.kanji}</b>
              {q.word.kanji !== q.word.kana && <span className="ml-2 text-pri-deep">{q.word.kana}</span>}
              <span className="ml-2 text-sub">{q.word.meaning}</span>
            </div>
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
