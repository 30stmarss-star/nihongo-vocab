import type { Word } from "../data/types";
import type { ProgressMap } from "../lib/srs";
import { WordTable } from "./WordTable";

/**
 * 만화 단어장 — 만화에서 담은 단어만, **공부한 순서대로** 묶어서 본다.
 *
 * 메인 단어장(난이도별)과는 목적이 다르다. 여기는 "어디서 주웠는지"를 기억하는 곳이라
 * 묶음 이름이 그때 읽던 장면을 가리키고, 순서는 절대 재정렬하지 않는다.
 * 같은 단어가 메인 단어장에도 들어 있다 — 여기는 별도 보관함이 아니라 다른 시선이다.
 */

export interface MangaSection {
  key: string;
  name: string;
  subtitle: string | null;
  kind: string;
  words: Word[];
}

/** 묶음이 무엇으로 엮였는지 — 쌓인 양에 따라 모델이 고른다 */
const KIND_LABEL: Record<string, string> = {
  scene: "장면",
  flow: "흐름",
  theme: "주제",
  day: "그날",
};

interface Props {
  sections: MangaSection[];
  progress: ProgressMap;
  reverse: boolean;
  onToggleReverse: () => void;
  onShowCard: (word: Word, x: number, y: number) => void;
  onSetLevel: (id: string, lv: "hard" | "easy" | "done") => void;
}

export function MangaBook({
  sections,
  progress,
  reverse,
  onToggleReverse,
  onShowCard,
  onSetLevel,
}: Props) {
  const total = sections.reduce((n, s) => n + s.words.length, 0);

  if (!sections.length) {
    return (
      <div className="rounded-3xl bg-card px-6 py-14 text-center text-sm leading-relaxed text-mut shadow-soft">
        아직 담은 단어가 없어요.
        <br />
        <b className="text-sub">읽기</b>에서 페이지를 넣고 어휘 옆의{" "}
        <b className="text-pri-deep">담기</b>를 누르면
        <br />
        읽던 장면 이름이 붙어서 여기 쌓여요.
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-mut">
          만화에서 담은 {total}개. <b className="text-sub">담은 순서</b>대로 묶여 있어요.
        </p>
        <button
          onClick={onToggleReverse}
          className="shrink-0 rounded-xl bg-card px-3 py-1.5 text-xs font-bold text-pri-deep shadow-soft transition active:scale-95"
        >
          {reverse ? "한국어 → 일본어" : "일본어 → 한국어"} ⇄
        </button>
      </div>

      <div className="space-y-4">
        {sections.map((g) => (
          <section key={g.key}>
            <div className="mb-1.5 flex items-baseline gap-2 px-1">
              <h3 className="min-w-0 text-sm font-extrabold text-ink">{g.name}</h3>
              <span className="shrink-0 rounded-full bg-pri-soft px-2 py-0.5 text-[10px] font-bold text-pri-deep">
                {KIND_LABEL[g.kind] ?? "장면"}
              </span>
              <span className="shrink-0 text-xs font-semibold text-mut">{g.words.length}개</span>
            </div>
            {g.subtitle && (
              <p className="mb-1.5 px-1 text-xs leading-relaxed text-mut">{g.subtitle}</p>
            )}
            <WordTable
              words={g.words}
              progress={progress}
              mode={reverse ? "ko" : "jp"}
              onShowCard={onShowCard}
              onSetLevel={onSetLevel}
            />
          </section>
        ))}
      </div>
    </>
  );
}
