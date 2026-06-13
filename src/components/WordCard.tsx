import type { Word } from "../data/types";
import { typeLabel } from "../data/types";
import { tradForm } from "../data/shinjitai";

/** 단어를 꾹 누르고 있는 동안 떠 있는 상세 카드. 손/마우스를 떼면 사라진다. */
export function WordCard({ word, x, y }: { word: Word; x: number; y: number }) {
  // 깨진/누락 데이터에도 카드가 죽지 않도록 방어
  const hanja = Array.isArray(word.hanja) ? word.hanja : [];
  const examples = Array.isArray(word.examples) ? word.examples : [];
  // 일본 신자체(약식)면 한국식 정자 병기
  const tradWord = tradForm(word.kanji);

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
      <div className="rounded-2xl border border-white/10 bg-neutral-900 p-4 shadow-2xl shadow-black/60 ring-1 ring-black/40">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-white">{word.kanji}</span>
          {tradWord && (
            <span className="text-base text-amber-300/90" title="한국식 정자">
              ({tradWord})
            </span>
          )}
          {word.kanji !== word.kana && (
            <span className="text-sm text-neutral-400">{word.kana}</span>
          )}
          <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-xs text-neutral-300">
            {word.level} · {typeLabel(word.type)}
          </span>
        </div>

        <div className="mt-1 text-base text-emerald-300">{word.meaning}</div>

        {hanja.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
              한자 훈독
            </div>
            <div className="flex flex-wrap gap-1.5">
              {hanja.map((h, i) => {
                const trad = tradForm(h.char);
                return (
                  <span
                    key={i}
                    className="rounded-md bg-white/5 px-2 py-1 text-sm text-neutral-200"
                  >
                    <b className="mr-1 text-white">
                      {h.char}
                      {trad && <span className="text-amber-300/90">({trad})</span>}
                    </b>
                    {h.reading}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
            예문
          </div>
          <ul className="space-y-2">
            {examples.map((ex, i) => (
              <li key={i} className="text-sm">
                <div className="text-neutral-100">{ex.jp}</div>
                <div className="text-xs text-neutral-500">{ex.kana}</div>
                <div className="text-xs text-neutral-400">{ex.ko}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
