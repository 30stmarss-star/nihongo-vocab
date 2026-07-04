import { useMemo, useRef, useState } from "react";
import type { Word } from "../data/types";
import { boundPrefix } from "../data/types";
import { weightFor, type ProgressMap } from "../lib/srs";
import { readingMatches } from "../lib/kana";
import { supabase } from "../lib/supabase";

/**
 * 단어 시험. 출제 대상은 '학습한 단어'(한 번이라도 학습지에 나온 것).
 *  - 단어→뜻: 4지선다
 *  - 뜻→단어: 독음(히라가나) 타이핑
 *  - 문장 빈칸(cloze): Claude(generate-quiz) 생성 — 실패하면 4지선다로 대체
 * 30문항을 다 풀면 채점. 틀린 단어는 SRS 숙련도 하락(복습 환급), 맞힌 건 상승.
 */

export interface QuizResult {
  id: string;
  correct: boolean;
}

interface Props {
  pool: Word[]; // 학습한 단어(시험 대상)
  bandWords: Word[]; // 오답 보기 생성용(밴드 전체)
  progress: ProgressMap;
  onApplyResults: (results: QuizResult[]) => void;
  onClose: () => void;
}

type Q =
  | { kind: "mc"; word: Word; prompt: string; choices: string[]; answer: number }
  | { kind: "type"; word: Word }
  | {
      kind: "cloze";
      word: Word;
      sentence: string;
      ko: string;
      choices: string[];
      answer: number;
    };

const TOTAL = 30;

const importance = (f?: number) => (f ?? 2) <= 1 ? 1.5 : (f ?? 2) === 2 ? 1 : 0.7;

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** 가중치 비복원 추출 */
function weightedPick(words: Word[], count: number, progress: ProgressMap): Word[] {
  const now = Date.now();
  const items = words.map((w) => ({
    w,
    weight: Math.max(0.02, weightFor(progress[w.id], now) * importance(w.freq)),
  }));
  const out: Word[] = [];
  const n = Math.min(count, items.length);
  for (let i = 0; i < n; i++) {
    const total = items.reduce((s, it) => s + it.weight, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let j = 0; j < items.length; j++) {
      r -= items[j].weight;
      if (r <= 0) {
        idx = j;
        break;
      }
    }
    out.push(items[idx].w);
    items.splice(idx, 1);
  }
  return out;
}

/**
 * 오답 보기 생성. 헷갈리게: **같은 품사 → 같은 레벨**을 우선해 뜻만 보고 소거하지 못하게.
 * (같은 품사 뜻이 부족하면 같은 레벨 → 아무거나로 보충)
 */
function meaningChoices(word: Word, band: Word[]): { choices: string[]; answer: number } {
  const usable = band.filter((w) => w.id !== word.id && w.meaning !== word.meaning);
  const samePos = usable.filter((w) => w.type.kind === word.type.kind);
  const rank = [
    ...shuffle(samePos.filter((w) => w.level === word.level)),
    ...shuffle(samePos),
    ...shuffle(usable.filter((w) => w.level === word.level)),
    ...shuffle(usable),
  ];
  const picks: string[] = [];
  const seen = new Set([word.meaning]);
  for (const w of rank) {
    if (seen.has(w.meaning)) continue;
    seen.add(w.meaning);
    picks.push(w.meaning);
    if (picks.length === 3) break;
  }
  const all = shuffle([word.meaning, ...picks]);
  return { choices: all, answer: all.indexOf(word.meaning) };
}

export function Quiz({ pool, bandWords, progress, onApplyResults, onClose }: Props) {
  const [phase, setPhase] = useState<"intro" | "loading" | "quiz" | "result">("intro");
  const [qs, setQs] = useState<Q[]>([]);
  const [cur, setCur] = useState(0);
  // 답: mc/cloze는 선택 index(number), type은 입력 문자열
  const [answers, setAnswers] = useState<Record<number, number | string>>({});
  const [note, setNote] = useState("");
  const applied = useRef(false);

  const total = Math.min(TOTAL, pool.length);
  const enough = total >= 6;

  async function build() {
    setPhase("loading");
    setNote("");
    // 1) 대상 단어 가중 추출
    const picked = weightedPick(pool, total, progress);
    // 2) 유형 배분: cloze ~34%, type ~26%, mc 나머지
    const nCloze = Math.min(12, Math.round(total * 0.34));
    const nType = Math.round(total * 0.26);
    const clozeWords = picked.slice(0, nCloze);
    const typeWords = picked.slice(nCloze, nCloze + nType);
    const mcWords = picked.slice(nCloze + nType);

    const built: Q[] = [];
    // 3) 문장 빈칸: Edge Function 호출 (실패 시 mc로 대체)
    let clozeOk = false;
    if (clozeWords.length && supabase) {
      try {
        const { data, error } = await supabase.functions.invoke("generate-quiz", {
          body: {
            words: clozeWords.map((w) => ({
              kanji: w.kanji,
              kana: w.kana,
              meaning: w.meaning,
              level: w.level,
              pos: w.type.kind,
            })),
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const items: Array<{
          answerKanji: string;
          sentence: string;
          ko: string;
          choices: string[];
          answerIndex: number;
        }> = Array.isArray(data?.questions) ? data.questions : [];
        for (const w of clozeWords) {
          const it = items.find((x) => x.answerKanji === w.kanji);
          if (
            it &&
            Array.isArray(it.choices) &&
            it.choices.length === 4 &&
            it.sentence.includes("＿") &&
            it.answerIndex >= 0 &&
            it.answerIndex < 4
          ) {
            built.push({
              kind: "cloze",
              word: w,
              sentence: it.sentence,
              ko: it.ko ?? "",
              choices: it.choices,
              answer: it.answerIndex,
            });
          } else {
            const { choices, answer } = meaningChoices(w, bandWords);
            built.push({ kind: "mc", word: w, prompt: boundPrefix(w) + w.kanji, choices, answer });
          }
        }
        clozeOk = true;
      } catch {
        // 오프라인/미배포 → 전부 4지선다로
        for (const w of clozeWords) {
          const { choices, answer } = meaningChoices(w, bandWords);
          built.push({ kind: "mc", word: w, prompt: boundPrefix(w) + w.kanji, choices, answer });
        }
      }
    }
    // 4) 뜻→단어 타이핑
    for (const w of typeWords) built.push({ kind: "type", word: w });
    // 5) 단어→뜻 4지선다
    for (const w of mcWords) {
      const { choices, answer } = meaningChoices(w, bandWords);
      built.push({ kind: "mc", word: w, prompt: boundPrefix(w) + w.kanji, choices, answer });
    }

    setQs(shuffle(built));
    setAnswers({});
    setCur(0);
    setPhase("quiz");
    if (!clozeOk && clozeWords.length)
      setNote("문장 문제 생성이 아직 준비되지 않아 4지선다로 대체했어요.");
  }

  function grade(): { results: QuizResult[]; correctCount: number } {
    const results: QuizResult[] = [];
    let correctCount = 0;
    qs.forEach((q, i) => {
      const a = answers[i];
      let ok = false;
      if (q.kind === "type") {
        ok = readingMatches(typeof a === "string" ? a : "", q.word.kana, q.word.kanji);
      } else {
        ok = a === q.answer;
      }
      if (ok) correctCount++;
      results.push({ id: q.word.id, correct: ok });
    });
    return { results, correctCount };
  }

  function finish() {
    const { results } = grade();
    if (!applied.current) {
      applied.current = true;
      onApplyResults(results);
    }
    setPhase("result");
  }

  const graded = useMemo(() => (phase === "result" ? grade() : null), [phase]); // eslint-disable-line

  // ── 인트로 ──
  if (phase === "intro") {
    return (
      <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-6 text-center">
        <div className="text-lg font-bold text-white">단어 시험 📝</div>
        <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-400">
          학습한 단어에서 <b className="text-neutral-200">{total}문항</b>이 나와요.
          단어→뜻(4지선다), 뜻→단어(독음 입력), 문장 빈칸이 섞여 나옵니다. 다 풀면
          채점하고, <b className="text-neutral-200">틀린 단어는 복습에 다시</b> 떠요.
        </p>
        {!enough ? (
          <p className="mt-4 text-sm text-amber-300">
            학습한 단어가 부족해요(최소 6개). 학습지에서 좀 더 풀어 보세요.
          </p>
        ) : (
          <button
            onClick={build}
            className="mt-5 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
          >
            시험 시작
          </button>
        )}
      </div>
    );
  }

  // ── 로딩 ──
  if (phase === "loading") {
    return (
      <div className="rounded-2xl border border-white/10 bg-neutral-950/60 px-6 py-16 text-center text-sm text-neutral-400">
        시험지 만드는 중…
        <div className="mt-2 text-xs text-neutral-600">문장 문제를 생성하고 있어요</div>
      </div>
    );
  }

  // ── 결과 ──
  if (phase === "result" && graded) {
    const { results, correctCount } = graded;
    const pct = Math.round((correctCount / qs.length) * 100);
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-6 text-center">
          <div className="text-sm text-neutral-400">점수</div>
          <div className="mt-1 text-3xl font-bold text-white">
            {correctCount} <span className="text-neutral-500">/ {qs.length}</span>
          </div>
          <div
            className={[
              "mt-1 text-sm font-semibold",
              pct >= 80 ? "text-emerald-400" : pct >= 50 ? "text-amber-300" : "text-rose-400",
            ].join(" ")}
          >
            {pct}점
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            틀린 단어는 복습 목록으로 돌아갔어요. 맞힌 단어는 숙련도가 올랐어요.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => {
                applied.current = false;
                setPhase("intro");
              }}
              className="rounded-xl bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/30"
            >
              다시 시험
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-neutral-300 transition hover:border-white/25"
            >
              닫기
            </button>
          </div>
        </div>

        {/* 문항별 리뷰 */}
        <ul className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/60">
          {qs.map((q, i) => {
            const ok = results[i].correct;
            const yourRaw = answers[i];
            const your =
              q.kind === "type"
                ? typeof yourRaw === "string" && yourRaw
                  ? yourRaw
                  : "(무응답)"
                : typeof yourRaw === "number"
                  ? q.choices[yourRaw]
                  : "(무응답)";
            const correct =
              q.kind === "type" ? q.word.kana : q.choices[q.answer];
            return (
              <li key={i} className="border-b border-white/5 px-4 py-3 last:border-0">
                <div className="flex items-start gap-2">
                  <span className={ok ? "text-emerald-400" : "text-rose-400"}>
                    {ok ? "○" : "✕"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white">
                      {boundPrefix(q.word) + q.word.kanji}
                      <span className="ml-2 text-xs text-neutral-500">
                        {q.word.kana} · {q.word.meaning}
                      </span>
                    </div>
                    {q.kind === "cloze" && (
                      <div className="mt-1 text-xs text-neutral-400">{q.sentence}</div>
                    )}
                    {!ok && (
                      <div className="mt-1 text-xs">
                        <span className="text-rose-300/80">내 답: {your}</span>
                        <span className="ml-3 text-emerald-300/80">정답: {correct}</span>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // ── 시험 진행 ──
  const q = qs[cur];
  if (!q) return null;
  const sel = answers[cur];
  const last = cur === qs.length - 1;
  const answered =
    q.kind === "type" ? typeof sel === "string" && sel.trim().length > 0 : typeof sel === "number";

  function choose(v: number | string) {
    setAnswers((a) => ({ ...a, [cur]: v }));
  }
  function next() {
    if (last) finish();
    else setCur((c) => c + 1);
  }

  return (
    <div className="space-y-4">
      {/* 진행바 */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
          <span>
            {cur + 1} / {qs.length}
          </span>
          <button onClick={onClose} className="hover:text-neutral-300">
            그만두기
          </button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${((cur + 1) / qs.length) * 100}%` }}
          />
        </div>
      </div>

      {note && <div className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-300">{note}</div>}

      <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-5">
        {/* 문제 */}
        {q.kind === "mc" && (
          <>
            <div className="text-xs text-neutral-500">뜻을 고르세요</div>
            <div className="mt-1 text-2xl font-semibold text-white">{q.prompt}</div>
            <div className="mt-4 grid gap-2">
              {q.choices.map((c, i) => (
                <button
                  key={i}
                  onClick={() => choose(i)}
                  className={[
                    "rounded-xl border px-4 py-3 text-left text-sm transition",
                    sel === i
                      ? "border-emerald-400 bg-emerald-500/15 text-white"
                      : "border-white/10 bg-neutral-900 text-neutral-200 hover:border-white/25",
                  ].join(" ")}
                >
                  {c}
                </button>
              ))}
            </div>
          </>
        )}

        {q.kind === "cloze" && (
          <>
            <div className="text-xs text-neutral-500">빈칸에 알맞은 단어</div>
            <div className="mt-1 text-lg leading-relaxed text-white">{q.sentence}</div>
            {q.ko && <div className="mt-1 text-xs text-neutral-500">{q.ko.replace(q.word.meaning, "____")}</div>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {q.choices.map((c, i) => (
                <button
                  key={i}
                  onClick={() => choose(i)}
                  className={[
                    "rounded-xl border px-3 py-3 text-center text-base transition",
                    sel === i
                      ? "border-emerald-400 bg-emerald-500/15 text-white"
                      : "border-white/10 bg-neutral-900 text-neutral-200 hover:border-white/25",
                  ].join(" ")}
                >
                  {c}
                </button>
              ))}
            </div>
          </>
        )}

        {q.kind === "type" && (
          <>
            <div className="text-xs text-neutral-500">
              뜻을 보고 독음 입력 <span className="text-neutral-600">(히라가나·한국어 독음 모두 인정)</span>
            </div>
            <div className="mt-1 text-2xl font-semibold text-white">{q.word.meaning}</div>
            <input
              value={typeof sel === "string" ? sel : ""}
              onChange={(e) => choose(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && answered) next();
              }}
              inputMode="text"
              autoComplete="off"
              autoCapitalize="off"
              placeholder="예: にる 또는 니루"
              className="mt-4 w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-lg text-white outline-none focus:border-emerald-400/60"
            />
          </>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={next}
          disabled={!answered}
          className={[
            "rounded-xl px-6 py-2.5 text-sm font-semibold transition",
            answered
              ? "bg-emerald-500 text-white hover:bg-emerald-400"
              : "cursor-not-allowed bg-neutral-800 text-neutral-500",
          ].join(" ")}
        >
          {last ? "채점하기" : "다음"}
        </button>
      </div>
    </div>
  );
}
