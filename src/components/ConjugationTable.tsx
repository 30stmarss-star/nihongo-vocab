import { useMemo, useState } from "react";
import type { Word } from "../data/types";
import { conjugationTable } from "../lib/conjugate";

/**
 * 동사·형용사 활용표. 예문 하나로는 한 가지 꼴밖에 못 보니,
 * 사전형에서 대표 활용형을 만들어 한눈에 보여준다. (계산이라 즉시·무료)
 */
export function ConjugationTable({ word }: { word: Word }) {
  const rows = useMemo(() => conjugationTable(word, word.kanji), [word]);
  const kanaRows = useMemo(
    () => (word.kanji === word.kana ? [] : conjugationTable(word, word.kana)),
    [word]
  );
  const [open, setOpen] = useState(false);

  if (!rows.length) return null;

  return (
    <div className="mt-3 text-left">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // 카드 뒤집기와 분리
          setOpen((o) => !o);
        }}
        className="w-full rounded-2xl bg-pri-soft py-2.5 text-sm font-bold text-pri-deep transition active:scale-[0.98]"
      >
        {open ? "활용형 접기 ▲" : "🔀 활용형 보기"}
      </button>

      {open && (
        <ul className="mt-3 animate-[popIn_0.2s_ease-out] overflow-hidden rounded-2xl bg-page">
          {rows.map((r, i) => (
            <li
              key={r.label}
              className="flex items-baseline gap-3 border-b border-line px-3.5 py-2.5 last:border-0"
            >
              <span className="w-[4.5rem] shrink-0 text-xs font-bold text-mut">{r.label}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ink [overflow-wrap:anywhere]">{r.form}</span>
                {kanaRows[i] && kanaRows[i].form !== r.form && (
                  <span className="block text-xs text-pri">{kanaRows[i].form}</span>
                )}
                <span className="block text-xs text-sub">{r.hint}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
