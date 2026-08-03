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
  saving,
  onAddBook,
}: {
  word: Word;
  x: number;
  y: number;
  inBook?: boolean;
  saving?: boolean;
  onAddBook?: () => void;
}) {
  // 깨진/누락 데이터에도 카드가 죽지 않도록 방어
  const hanja = Array.isArray(word.hanja) ? word.hanja : [];
  const examples = Array.isArray(word.examples) ? word.examples : [];
  // 일본 신자체(약식)면 한국식 정자 병기
  const tradWord = tradForm(word.kanji);
  // 후행 결합형(예: ~ながら)이면 표제어·독음 앞에 ~
  const pre = boundPrefix(word);

  /**
   * 화면 안에 들어오도록 위치와 '쓸 수 있는 높이'를 같이 정한다.
   * 높이 제한만 걸어두면(예전 max-h) 탭한 지점이 화면 중간일 때 카드가 아래로
   * 삐져나간다 — 자기 박스는 넘치지 않으니 스크롤도 안 생겨 아래가 잘린 채 끝난다.
   */
  const W = 320;
  const M = 12; // 화면 가장자리 여백
  const GAP = 20; // 탭한 지점과 카드 사이
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(Math.max(M, x - W / 2), vw - W - M);
  const above = y - GAP - M;
  const below = vh - y - GAP - M;
  const flipUp = above > below;
  // 위아래 어느 쪽도 좁으면 탭 지점을 포기하고 화면 전체를 쓴다(그래야 스크롤이 산다)
  const roomy = Math.max(above, below) >= 260;
  const maxH = roomy ? Math.max(above, below) : vh - M * 2;
  const top = roomy ? (flipUp ? undefined : y + GAP) : M;
  const bottom = roomy && flipUp ? vh - y + GAP : undefined;

  return (
    <div
      className="no-select pointer-events-none fixed z-50"
      style={{ left, top, bottom, width: W }}
    >
      <div
        style={{ maxHeight: maxH }}
        className="pointer-events-auto overflow-y-auto overscroll-contain rounded-3xl bg-card p-4 shadow-pop ring-1 ring-line"
      >
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
          <span className="ml-auto rounded-full bg-page px-2 py-0.5 text-xs font-semibold text-sub">
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
                    className="rounded-md bg-page px-2 py-1 text-sm text-sub"
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
            disabled={inBook || saving}
            onClick={onAddBook}
            className={[
              "pointer-events-auto mt-3 w-full rounded-xl py-2.5 text-sm font-bold transition active:scale-[0.98]",
              inBook
                ? "bg-mint-soft text-mint"
                : "bg-pri text-white shadow-soft hover:bg-pri-deep disabled:opacity-60",
            ].join(" ")}
          >
            {inBook ? "✓ 단어장에 있어요" : saving ? "카드 만드는 중…" : "📥 단어장에 넣기"}
          </button>
        )}
      </div>
    </div>
  );
}
