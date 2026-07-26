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
import { scanWords } from "./JpText";
import { ExampleLine } from "./ExampleLine";

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
/** 한 번에 푸는 문항 수. 한 단어당 한 문항이라 곧 출제 단어 수이기도 하다. */
const TOTAL_Q = 30;
/** 그중 '예전에 외운 단어' 몫 — 오늘 것만 풀면 단기기억으로 통과해버린다(간격 인출). */
const PAST_Q = 6;

interface Props {
  words: Word[]; // 오늘의 단어 전체
  pastWords: Word[]; // 예전에 외운 단어 (섞어 낼 후보)
  bandWords: Word[]; // 오답 보기 생성용
  progress: ProgressMap; // 어려움/쉬움 판정용
  examItems?: ExamItem[]; // 미리 만들어 둔 문장형 문항
  onApplyResults: (results: QuizResult[]) => void; // 1차 결과만 SRS 반영
  onPassed: (score: number) => void;
  onExit: () => void;
  onShowCard: (word: Word, x: number, y: number) => void; // 해설의 단어 탭 → 카드
}

/** 이 단어를 아직 어려워하는가 (어려움 = 문항 2개) */
const isHard = (w: Word, p: ProgressMap) => !isRetired(p[w.id]) && !isKnown(p[w.id]);

/**
 * 보기 표기를 사전 표준 표기로 맞춘다.
 * 한 보기만 가나로 나오면(けが vs 風邪·元気·熱心) 그 자체가 힌트가 되어 문제가 망가진다.
 */
function normalizeChoices(choices: string[], dictionary: Word[]): string[] {
  return choices.map((c) => {
    const w = dictionary.find((x) => x.kana === c && x.kanji !== x.kana);
    return w ? w.kanji : c;
  });
}

/** 문장형 문항을 화면용 Question으로 */
function toQuestion(item: ExamItem, w: Word, dictionary: Word[]): Question {
  // 통문장 보기(용법)는 손대지 않는다 — 단어 단위 보기만 표기를 맞춘다
  const choices = item.kind === "usage" ? item.choices : normalizeChoices(item.choices, dictionary);
  const base = { word: w, sentence: item.sentence, ko: item.ko, choices, answer: item.answerIndex };
  if (item.kind === "usage") return { kind: "usage", word: w, choices, answer: item.answerIndex };
  return item.kind === "cloze" ? { kind: "cloze", ...base } : { kind: "synonym", ...base };
}

/**
 * 오늘 시험 볼 단어를 고른다. 오늘 배운 단어가 40개라도 전부 내지 않는다 —
 * 한 번에 30문항이 집중이 유지되는 한계고, 못 뽑힌 단어는 내일 SRS가 다시 데려온다.
 * 우선순위: 새 단어 → 어려운 복습 → 쉬운 복습. 여기에 예전 단어를 조금 섞는다.
 */
export function pickExamWords(
  today: Word[],
  past: Word[],
  progress: ProgressMap
): Word[] {
  const rank = (w: Word) => (isHard(w, progress) ? 0 : isRetired(progress[w.id]) ? 2 : 1);
  const todaySorted = [...today].sort((a, b) => rank(a) - rank(b));

  const pastCount = Math.min(PAST_Q, past.length);
  const fromToday = todaySorted.slice(0, Math.max(0, TOTAL_Q - pastCount));
  // 예전 단어는 오래 안 본 것부터
  const fromPast = [...past]
    .sort((a, b) => (progress[a.id]?.lastSeen ?? 0) - (progress[b.id]?.lastSeen ?? 0))
    .slice(0, pastCount);

  return [...fromToday, ...fromPast];
}

/** 시험지 구성 — 한 단어당 한 문항, 유형은 그 단어로 만들 수 있는 것 중 무작위. */
function buildQuestions(
  words: Word[],
  pool: Word[],
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
    const sentence = (byKanji.get(w.kanji) ?? []).map((it) => toQuestion(it, w, pool));
    const rule = [readingQ(w, pool), writingQ(w, pool), meaningQ(w, pool), conjugateQ(w)].filter(
      Boolean
    ) as Question[];
    const candidates = shuffle([...sentence, ...shuffle(rule)]);
    // 후보가 하나도 없으면(가나 단어 등) 타이핑 문제로
    out.push(candidates[0] ?? typeQ(w));
  }
  return shuffle(out);
}

export function DailyTest({
  words,
  pastWords,
  bandWords,
  progress,
  examItems,
  onApplyResults,
  onPassed,
  onExit,
  onShowCard,
}: Props) {
  // 이번 시험에 실제로 출제되는 단어 (오늘 것 일부 + 예전 것 조금)
  const examWords = useMemo(
    () => pickExamWords(words, pastWords, progress),
    // 시험지를 만들 때 한 번만 정해지면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const todayCount = examWords.filter((w) => words.some((x) => x.id === w.id)).length;
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

  // 점수는 출제된 단어 기준
  const score = useMemo(() => {
    if (!examWords.length) return 0;
    let ok = 0;
    for (const w of examWords) if (firstTry.current.get(w.id)) ok++;
    return Math.round((ok / examWords.length) * 100);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    firstTry.current = new Map();
    applied.current = false;
    setQs(buildQuestions(examWords, bandWords, examItems));
    setWrongQueue([]);
    setCur(0);
    setInput("");
    setJudged(null);
    setPhase("quiz");
  }

  // 오답 다지기는 항상 큐의 맨 앞을 푼다
  const q = phase === "drill" ? wrongQueue[0] : qs[cur];

  /**
   * 채점만 하고 큐는 건드리지 않는다.
   * (여기서 큐를 바꾸면 해설이 떠 있는 사이 화면 뒤에서 문항이 넘어가 버린다)
   */
  function judge(picked?: number) {
    if (!q || judged) return;
    const ok = q.kind === "type" ? readingMatches(input, q.word.kana, q.word.kanji) : picked === q.answer;

    if (phase === "quiz") {
      // 같은 단어를 여러 번 물으면 '전부 맞아야' 아는 것으로 친다
      const prev = firstTry.current.get(q.word.id);
      firstTry.current.set(q.word.id, prev === undefined ? ok : prev && ok);
      // 이전 문제로 돌아가 다시 풀 수 있으니 중복으로 쌓이지 않게 한다
      if (!ok) setWrongQueue((p) => (p.includes(q) ? p : [...p, q]));
    }
    setJudged({ ok, picked });
  }

  /** '계속'을 눌렀을 때만 다음 문항으로 넘어간다 */
  function next() {
    const wasOk = !!judged?.ok;
    setJudged(null);
    setInput("");

    if (phase === "quiz") {
      if (cur + 1 < qs.length) {
        setCur(cur + 1);
        return;
      }
      if (!applied.current) {
        applied.current = true;
        onApplyResults(examWords.map((w) => ({ id: w.id, correct: !!firstTry.current.get(w.id) })));
      }
      if (wrongQueue.length) setPhase("drill");
      else setPhase("result");
      return;
    }

    // 다지기: 맞히면 큐에서 빼고, 틀리면 맨 뒤로 돌린다
    const [head, ...rest] = wrongQueue;
    const nextQueue = wasOk ? rest : [...rest, head];
    setWrongQueue(nextQueue);
    if (!nextQueue.length) setPhase("result");
  }

  // 낼 문항이 없는데 풀이 화면에 머무르면 빈 화면이 된다 — 결과로 넘긴다
  useEffect(() => {
    if ((phase === "quiz" || phase === "drill") && !q) setPhase("result");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, q]);

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
    const pastCount = examWords.length - todayCount;
    return (
      <div className="mx-auto max-w-md px-5 pt-4">
        <button onClick={onExit} aria-label="나가기" className="grid h-9 w-9 place-items-center rounded-full bg-card text-sub shadow-soft">
          ✕
        </button>
        <div className="mt-6 rounded-3xl bg-card p-7 text-center shadow-pop">
          <div className="text-4xl">📝</div>
          <h2 className="mt-3 text-xl font-extrabold text-ink">데일리 시험</h2>
          <p className="mt-3 text-sm leading-relaxed text-sub">
            <b className="text-ink">{examWords.length}문항</b>
            {pastCount > 0 && <> · 예전 단어 {pastCount}개 포함</>}
            <br />
            <b className="text-pri-deep">{PASS_PCT}점 이상</b>이면 통과!
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
    // 실제로 출제된 단어만 센다. 오늘 목록 전체를 세면 안 물어본 단어까지 '틀림'이 된다.
    const wrongWords = examWords.filter((w) => !firstTry.current.get(w.id));
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
                {examWords.length - wrongWords.length}
              </div>
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
  if (!q) return null; // 위 효과가 곧 결과 화면으로 넘긴다

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
        <div
          key={`${phase}-${phase === "drill" ? wrongQueue.length : cur}-${q.word.id}-${q.kind}`}
          className="animate-[cardIn_0.2s_ease-out] rounded-3xl bg-card p-6 shadow-pop"
        >
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
                className="mt-5 w-full rounded-2xl border-2 border-line bg-page px-4 py-3.5 text-lg text-ink outline-none transition focus:border-pri"
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
            <button
              type="button"
              onClick={(e) => onShowCard(q.word, e.clientX, e.clientY)}
              className="mt-1.5 block text-left text-sm text-ink"
            >
              <b>{headword(q.word)}</b>
              {q.word.kanji !== q.word.kana && <span className="ml-2 text-pri-deep">{q.word.kana}</span>}
              <span className="ml-2 text-sub">{q.word.meaning}</span>
            </button>
            {"ko" in q && q.ko && <div className="mt-1 text-xs text-sub">{q.ko}</div>}
            {q.kind === "conjugate" && (
              <div className="mt-1 text-xs text-sub">
                {q.label} — {q.hint}
              </div>
            )}
            {/* 지문 속 단어 풀이 + 다른 보기들이 무슨 단어였는지 (전부 탭하면 카드) */}
            <SentenceGlossary q={q} dictionary={bandWords} onShowCard={onShowCard} />
            {q.kind !== "type" && (
              <ChoiceGlossary
                q={q}
                picked={judged.picked}
                dictionary={bandWords}
                onShowCard={onShowCard}
              />
            )}
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center gap-3">
        {/* 방금 지나온 문제를 다시 보고 싶을 때 (본 시험에서만 — 다지기는 큐가 돌아간다) */}
        {phase === "quiz" && cur > 0 && (
          <button
            onClick={() => {
              setJudged(null);
              setInput("");
              setCur((c) => Math.max(0, c - 1));
            }}
            className="rounded-2xl bg-card px-4 py-3.5 text-sm font-bold text-sub shadow-soft transition active:scale-95"
          >
            ← 이전 문제
          </button>
        )}
        {judged && (
          <button
            onClick={next}
            className={[
              "flex-1 rounded-2xl py-3.5 font-bold text-white shadow-soft transition active:scale-95",
              judged.ok ? "bg-mint hover:brightness-105" : "bg-coral hover:brightness-105",
            ].join(" ")}
          >
            계속 →
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 문장형 문제 해설 — 지문에 나온 단어들의 독음·뜻을 정리해 준다.
 * 정답을 맞혀도 문장을 통째로 이해 못 하고 넘어가는 걸 막는다.
 */
function SentenceGlossary({
  q,
  dictionary,
  onShowCard,
}: {
  q: Question;
  dictionary: Word[];
  onShowCard: (word: Word, x: number, y: number) => void;
}) {
  // 빈칸 문제는 정답을 채워 완성된 문장으로 보여준다
  const sentence =
    q.kind === "cloze"
      ? q.sentence.replace("＿", q.choices[q.answer])
      : q.kind === "synonym"
        ? q.sentence
        : q.kind === "usage"
          ? q.choices[q.answer]
          : "";

  const words = useMemo(() => {
    if (!sentence) return [];
    const seen = new Set<string>();
    const out: Word[] = [];
    for (const part of scanWords(sentence.replace(/[【】]/g, ""), dictionary)) {
      if (part.word && !seen.has(part.word.id)) {
        seen.add(part.word.id);
        out.push(part.word);
      }
    }
    return out;
  }, [sentence, dictionary]);

  if (!sentence) return null;

  return (
    <div className="mt-3 border-t border-ink/10 pt-2.5">
      <div className="text-[11px] font-bold text-mut">문장 풀이</div>
      {/* 예문과 같은 줄 — 단어를 탭하면 카드, '문장 분해'를 누르면 조사까지 전부 */}
      <ExampleLine
        ex={{ jp: sentence.replace(/[【】]/g, ""), kana: "", ko: "" }}
        dictionary={dictionary}
        onShowCard={onShowCard}
      />
      {words.length > 0 && <WordGloss words={words} onShowCard={onShowCard} />}
    </div>
  );
}

/** 단어 목록 — 각 줄을 누르면 카드가 뜬다(사전에 없으면 카드에서 DB에 추가) */
function WordGloss({
  words,
  onShowCard,
  picked,
}: {
  words: Word[];
  onShowCard: (word: Word, x: number, y: number) => void;
  picked?: Word;
}) {
  return (
    <ul className="mt-1.5 space-y-0.5">
      {words.map((w) => (
        <li key={w.id}>
          <button
            type="button"
            onClick={(e) => onShowCard(w, e.clientX, e.clientY)}
            className="flex w-full items-baseline gap-1.5 rounded-md py-0.5 text-left text-xs transition active:bg-ink/5"
          >
            <span className={["font-bold", w === picked ? "text-coral" : "text-ink"].join(" ")}>
              {w.kanji}
            </span>
            {w.kanji !== w.kana && <span className="text-pri-deep">{w.kana}</span>}
            <span className="text-sub">{w.meaning}</span>
            {w === picked && <span className="ml-auto text-[10px] font-bold text-coral">내가 고른 답</span>}
          </button>
        </li>
      ))}
    </ul>
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
  onShowCard,
}: {
  q: Exclude<Question, { kind: "type" }>;
  picked?: number;
  dictionary: Word[];
  onShowCard: (word: Word, x: number, y: number) => void;
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
    .map((c, i) => ({ i, w: index.get(c) }))
    .filter((r) => r.w && r.i !== q.answer);
  if (!rows.length) return null;

  const pickedWord = picked !== undefined ? index.get(q.choices[picked]) : undefined;

  return (
    <div className="mt-3 border-t border-ink/10 pt-2.5">
      <div className="text-[11px] font-bold text-mut">다른 보기</div>
      <WordGloss words={rows.map((r) => r.w!)} picked={pickedWord} onShowCard={onShowCard} />
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
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-page)" strokeWidth="12" />
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
