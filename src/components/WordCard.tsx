import type { Word } from "../data/types";
import { boundPrefix, typeLabel } from "../data/types";
import { tradForm } from "../data/shinjitai";
import { KanjiInsight } from "./KanjiInsight";
import { ConjugationTable } from "./ConjugationTable";

/** 단어 상세 카드. inBook/onAddBook을 주면 '단어장에 넣기' 버튼이 붙는다. */
export function WordCard({
  word,
  x,
  y,
  inBook,
  onAddBook,
}: {
  word: Word;
  x: number;
  y: number;
  inBook?: boolean;
  onAddBook?: () => void;
}) {
  // 깨진/누락 데이터에도 카드가 죽지 않도록 방어
  const hanja = Array.isArray(word.hanja) ? word.hanja : [];
  const examples = Array.isArray(word.examples) ? word.examples : [];
  // 일본 신자체(약식)면 한국식 정자 병기
  const tradWord = tradForm(word.kanji);
  // 후행 결합형(예: ~ながら)이면 표제어·독음 앞에 ~
  const pre = boundPrefix(word);

  // 화면 밖으로 나가지 않도록 대략적으로 보정
  const W = 320;
  const left = Math.min(Math.max(12, x - W / 2), window.innerWidth - W - 12);
  const flipUp = y > window.innerHeight * 0.55;
  const top = flipUp ? undefined : y + 24;
  const bottom = flipUp ? window.innerHeight - y + 24 : undefined;

  return (
    <div
      className="no-select pointer-events-none fixed z-50"
      style={{ left, top, bottom, width: W }}
    >
      <div className="pointer-events-auto max-h-[72vh] overflow-y-auto overscroll-contain rounded-3xl bg-card p-4 shadow-pop ring-1 ring-line">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-ink">{pre}{word.kanji}</span>
          {tradWord && (
            <span className="text-base text-gold" title="한국식 정자">
              ({tradWord})
            </span>
          )}
          {word.kanji !== word.kana && (
            <span className="text-sm font-medium text-pri">{pre}{word.kana}</span>
          )}
          <span className="ml-auto rounded-full bg-base px-2 py-0.5 text-xs font-semibold text-sub">
            {word.level} · {typeLabel(word.type)}
          </span>
        </div>

        <div className="mt-1 text-base font-bold text-pri-deep">{word.meaning}</div>

        {hanja.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-mut">
              한자 훈독
            </div>
            <div className="flex flex-wrap gap-1.5">
              {hanja.map((h, i) => {
                const trad = tradForm(h.char);
                return (
                  <span
                    key={i}
                    className="rounded-md bg-base px-2 py-1 text-sm text-sub"
                  >
                    <b className="mr-1 text-ink">
                      {h.char}
                      {trad && <span className="text-gold">({trad})</span>}
                    </b>
                    {h.reading}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-mut">
            예문
          </div>
          <ul className="space-y-2">
            {examples.map((ex, i) => (
              <li key={i} className="text-sm">
                <div className="font-medium text-ink">{ex.jp}</div>
                {ex.kana !== ex.jp && <div className="text-xs text-mut">{ex.kana}</div>}
                <div className="text-xs text-sub">{ex.ko}</div>
              </li>
            ))}
          </ul>
        </div>

        <ConjugationTable word={word} />
        {word.kanji !== word.kana && <KanjiInsight word={word} />}

        {onAddBook && (
          <button
            type="button"
            disabled={inBook}
            onClick={onAddBook}
            className={[
              "pointer-events-auto mt-3 w-full rounded-xl py-2.5 text-sm font-bold transition active:scale-[0.98]",
              inBook
                ? "bg-mint-soft text-mint"
                : "bg-pri text-white shadow-soft hover:bg-pri-deep",
            ].join(" ")}
          >
            {inBook ? "✓ 단어장에 있어요" : "📥 단어장에 넣기"}
          </button>
        )}
      </div>
    </div>
  );
}
