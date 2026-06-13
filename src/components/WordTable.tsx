import { useRef, useState } from "react";
import type { Word } from "../data/types";
import type { Progress } from "../lib/srs";

interface Props {
  words: Word[];
  progress: Record<string, Progress | undefined>;
  onShowCard: (word: Word, x: number, y: number) => void;
  onHideCard: () => void;
  onKnown: (id: string) => void;
  onUnknown: (id: string) => void;
}

export function WordTable(props: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/60">
      {/* 헤더 */}
      <div className="flex items-center border-b border-white/10 px-3 py-3 text-xs font-medium tracking-wide text-neutral-400">
        <div className="w-[34%] shrink-0">단어</div>
        <div className="grid flex-1 grid-cols-2 gap-2">
          <span>독음(히라가나)</span>
          <span>뜻</span>
        </div>
        <div className="w-[56px] shrink-0 text-center">암기</div>
      </div>

      <ul>
        {props.words.map((w) => (
          <WordRow key={w.id} word={w} {...props} />
        ))}
      </ul>
    </div>
  );
}

function WordRow({
  word,
  progress,
  onShowCard,
  onHideCard,
  onKnown,
  onUnknown,
}: { word: Word } & Omit<Props, "words">) {
  const [revealed, setRevealed] = useState(false);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | undefined>(undefined);

  const p = progress[word.id];
  const known = !!p && p.seenCount > 0 && p.mastery >= 1;

  function toggle() {
    if (known) {
      onUnknown(word.id);
    } else {
      onKnown(word.id);
      setFlash(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(false), 650);
    }
  }

  return (
    <li
      className={[
        "relative flex items-center px-3 py-3 transition-colors",
        "border-b border-white/5 last:border-0",
        known ? "bg-emerald-500/[0.07]" : "",
        flash ? "bg-emerald-500/15" : "",
      ].join(" ")}
    >
      {/* 단어: 꾹 누르면 상세 카드 */}
      <button
        type="button"
        className="no-select w-[34%] shrink-0 cursor-pointer text-left text-lg text-white"
        style={{ touchAction: "none" }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => onShowCard(word, e.clientX, e.clientY)}
        onPointerUp={onHideCard}
        onPointerLeave={onHideCard}
        onPointerCancel={onHideCard}
      >
        {word.kanji}
      </button>

      {/* 정답 영역: 꾹 누르면 잠깐 보임 */}
      <div
        className="no-select relative flex-1"
        style={{ touchAction: "none" }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={() => setRevealed(true)}
        onPointerUp={() => setRevealed(false)}
        onPointerLeave={() => setRevealed(false)}
        onPointerCancel={() => setRevealed(false)}
      >
        <div className="grid grid-cols-2 gap-2">
          <MaskedCell text={word.kana} revealed={revealed} className="text-neutral-200" />
          <MaskedCell text={word.meaning} revealed={revealed} className="text-neutral-300" />
        </div>
      </div>

      {/* 암기 체크 (토글) */}
      <div className="flex w-[56px] shrink-0 items-center justify-center">
        <button
          type="button"
          aria-label={known ? "암기 해제" : "암기 완료"}
          aria-pressed={known}
          onClick={toggle}
          className={[
            "grid h-8 w-8 place-items-center rounded-full text-sm transition active:scale-90",
            known
              ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/40"
              : "border border-white/25 text-transparent hover:border-emerald-400/70",
          ].join(" ")}
        >
          ✓
        </button>
      </div>

      {/* 암기 체크 시 살짝 떠오르는 피드백 */}
      {flash && (
        <span className="pointer-events-none absolute right-16 top-1 animate-[floatUp_0.65s_ease-out] text-sm text-emerald-400">
          ✓ 외웠어요!
        </span>
      )}
    </li>
  );
}

/** 평소엔 깔끔한 바로 가려져 있고, 누르는 동안 글자가 부드럽게 드러나는 칸 */
function MaskedCell({
  text,
  revealed,
  className,
}: {
  text: string;
  revealed: boolean;
  className?: string;
}) {
  return (
    <span className="relative inline-flex items-center">
      <span
        className={[
          "transition-opacity duration-200",
          revealed ? "opacity-100" : "opacity-0",
          className,
        ].join(" ")}
      >
        {text}
      </span>
      <span
        aria-hidden
        className={[
          "absolute inset-y-1 -left-1 -right-1 rounded-[2px]",
          "bg-white/15",
          "transition-opacity duration-200",
          revealed ? "opacity-0" : "opacity-100",
        ].join(" ")}
      />
    </span>
  );
}
