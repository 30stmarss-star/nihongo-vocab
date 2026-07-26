import { useEffect, useState } from "react";
import type { Word } from "../data/types";
import { boundPrefix, typeLabel } from "../data/types";
import { tradForm } from "../data/shinjitai";
import { ExampleLine } from "./ExampleLine";
import { KanjiInsight } from "./KanjiInsight";
import { ConjugationTable } from "./ConjugationTable";

/**
 * 오늘의 단어 — 카드 한 장씩 집중 학습.
 * 새 단어 먼저, 복습 단어가 이어진다. 카드를 탭하면 답(뜻·한자·예문)이 열린다.
 * 복습 카드는 처음에 뜻이 가려진 채로 나와 '떠올리기' 연습이 된다.
 */

interface Props {
  words: Word[];
  newCount: number; // words 앞쪽 newCount개가 새 단어
  startIndex: number;
  dictionary: Word[]; // 예문 속 단어 탭 → 카드용 사전
  onShowCard: (word: Word, x: number, y: number) => void;
  onSeen: (id: string) => void; // 카드가 처음 화면에 나옴(도입 기록)
  onRate: (id: string, rating: "hard" | "easy") => void; // 어려움/쉬움 평가
  onProgress: (index: number) => void; // 이어하기 저장
  onDone: () => void;
  onExit: () => void;
}

export function DailyLearn({ words, newCount, startIndex, dictionary, onShowCard, onSeen, onRate, onProgress, onDone, onExit }: Props) {
  const [idx, setIdx] = useState(Math.min(startIndex, Math.max(0, words.length - 1)));
  const [open, setOpen] = useState(false);

  const w = words[idx];
  const isNew = idx < newCount;

  // 카드가 등장할 때 도입 기록 + 진행 저장
  useEffect(() => {
    if (w) {
      onSeen(w.id);
      onProgress(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (!w) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center text-sub">
        오늘 학습할 단어가 없어요.
        <button onClick={onDone} className="mt-6 block w-full rounded-2xl bg-pri py-3.5 font-bold text-white">
          완료
        </button>
      </div>
    );
  }

  const pre = boundPrefix(w);
  const trad = tradForm(w.kanji);
  const hanja = Array.isArray(w.hanja) ? w.hanja : [];
  const examples = Array.isArray(w.examples) ? w.examples : [];
  const last = idx === words.length - 1;

  function go(delta: number) {
    setOpen(false);
    const next = idx + delta;
    if (next >= words.length) onDone();
    else if (next >= 0) setIdx(next);
  }

  /** 어려움/쉬움을 남기고 다음 카드로. 어려움은 복습에 빨리 돌아온다. */
  function rate(r: "hard" | "easy") {
    onRate(w.id, r);
    go(1);
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-5 pb-8 pt-4">
      {/* 상단: 닫기 + 진행바 */}
      <div className="flex items-center gap-3">
        <button onClick={onExit} aria-label="나가기" className="grid h-9 w-9 place-items-center rounded-full bg-card text-sub shadow-soft">
          ✕
        </button>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-card shadow-inner">
          <div
            className="h-full rounded-full bg-pri transition-all duration-300"
            style={{ width: `${((idx + 1) / words.length) * 100}%` }}
          />
        </div>
        <span className="w-12 text-right text-sm font-semibold text-sub">
          {idx + 1}/{words.length}
        </span>
      </div>

      {/* 카드 */}
      <div className="mt-6 flex flex-1 flex-col">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
          }}
          key={w.id}
          className="flex min-h-[22rem] w-full grow animate-[cardIn_0.25s_ease-out] cursor-pointer flex-col rounded-3xl bg-card p-6 text-left shadow-pop"
        >
          <div className="flex items-center gap-2">
            <span
              className={[
                "rounded-full px-2.5 py-1 text-xs font-bold",
                isNew ? "bg-pri-soft text-pri-deep" : "bg-coral-soft text-coral",
              ].join(" ")}
            >
              {isNew ? "새 단어" : "복습"}
            </span>
            <span className="rounded-full bg-base px-2.5 py-1 text-xs font-semibold text-sub">
              {w.level} · {typeLabel(w.type)}
            </span>
          </div>

          <div className="flex grow flex-col items-center justify-center py-6 text-center">
            <div className="text-5xl font-bold leading-tight text-ink [overflow-wrap:anywhere]">
              {pre}
              {w.kanji}
            </div>

            {open ? (
              <div className="mt-5 w-full animate-[popIn_0.2s_ease-out]">
                {/* 독음·정자는 답을 열어야 보인다 — 먼저 떠올려보게 */}
                {w.kanji !== w.kana && (
                  <div className="text-xl font-medium text-pri">
                    {pre}
                    {w.kana}
                  </div>
                )}
                {trad && <div className="mt-1 text-sm text-gold">한국식 정자 {trad}</div>}
                <div className="mt-3 text-2xl font-bold text-pri-deep">{w.meaning}</div>
                {hanja.length > 0 && (
                  <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                    {hanja.map((h, i) => (
                      <span key={i} className="rounded-lg bg-base px-2 py-1 text-sm text-sub">
                        <b className="mr-1 text-ink">{h.char}</b>
                        {h.reading}
                      </span>
                    ))}
                  </div>
                )}
                {examples.slice(0, 2).map((ex, i) => (
                  <ExampleLine key={i} ex={ex} dictionary={dictionary} onShowCard={onShowCard} />
                ))}
                {examples.length > 0 && (
                  <div className="mt-2 text-[11px] text-mut">예문 속 단어를 탭하면 단어 카드가 떠요</div>
                )}
                <ConjugationTable word={w} />
                {w.kanji !== w.kana && <KanjiInsight word={w} />}
              </div>
            ) : (
              <div className="mt-8 text-sm font-medium text-mut">탭해서 독음·뜻 보기</div>
            )}
          </div>
        </div>
      </div>

      {/* 하단: 이 단어가 어땠는지 남기고 넘어간다 */}
      <div className="mt-5">
        <div className="flex gap-3">
          <button
            onClick={() => rate("hard")}
            className="flex-1 rounded-2xl bg-coral py-3.5 font-bold text-white shadow-soft transition hover:brightness-105 active:scale-95"
          >
            😵 어려움
          </button>
          <button
            onClick={() => rate("easy")}
            className="flex-1 rounded-2xl bg-mint py-3.5 font-bold text-white shadow-soft transition hover:brightness-105 active:scale-95"
          >
            😎 쉬움
          </button>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => go(-1)}
            disabled={idx === 0}
            className="rounded-xl px-2 py-1.5 text-sm font-bold text-mut transition disabled:opacity-40"
          >
            ← 이전
          </button>
          <span className="text-[11px] text-mut">
            어려움은 복습에 빨리 돌아와요{last ? " · 마지막 카드예요" : ""}
          </span>
          <button
            onClick={() => go(1)}
            className="ml-auto rounded-xl px-2 py-1.5 text-sm font-bold text-mut transition"
          >
            {last ? "완료 →" : "건너뛰기 →"}
          </button>
        </div>
      </div>
    </div>
  );
}
