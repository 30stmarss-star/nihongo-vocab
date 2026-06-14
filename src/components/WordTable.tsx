import { useRef, useState } from "react";
import type { Word } from "../data/types";
import type { Progress } from "../lib/srs";

/**
 * mode:
 *  - "jp"(기본): 왼쪽에 일본어 단어가 보이고, 독음·뜻이 가려짐(꾹 눌러 확인).
 *  - "ko": 왼쪽에 한국어 뜻이 보이고, 단어(한자)·독음이 가려짐(거꾸로 복습).
 * 어느 쪽이든 왼쪽(보이는 칸)을 누르면 동일한 상세 카드가 뜬다.
 */
type Mode = "jp" | "ko";

interface Props {
  words: Word[];
  progress: Record<string, Progress | undefined>;
  onShowCard: (word: Word, x: number, y: number) => void;
  onKnown: (id: string) => void;
  onUnknown: (id: string) => void;
  mode?: Mode;
}

export function WordTable(props: Props) {
  const ko = props.mode === "ko";
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/60">
      {/* 헤더 */}
      <div className="flex items-center border-b border-white/10 px-3 py-3 text-xs font-medium tracking-wide text-neutral-400">
        <div className={`${ko ? "w-[44%]" : "w-[34%]"} shrink-0`}>
          {ko ? "뜻" : "단어"}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-2">
          <span>{ko ? "단어" : "독음(히라가나)"}</span>
          <span>{ko ? "독음(히라가나)" : "뜻"}</span>
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
  onKnown,
  onUnknown,
  mode = "jp",
}: { word: Word } & Omit<Props, "words">) {
  const [revealed, setRevealed] = useState(false);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | undefined>(undefined);

  const p = progress[word.id];
  const known = !!p && p.seenCount > 0 && p.mastery >= 1;
  const ko = mode === "ko";

  // 보이는 칸(왼쪽)과 가려진 칸(오른쪽)을 모드에 따라 바꾼다.
  const promptText = ko ? word.meaning : word.kanji;
  const maskedLeft = ko ? word.kanji : word.kana; // 가려진 첫 칸
  const maskedRight = ko ? word.kana : word.meaning; // 가려진 둘째 칸

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
        "relative flex items-stretch px-3 py-1 transition-colors",
        "border-b border-white/5 last:border-0",
        known ? "bg-emerald-500/[0.07]" : "",
        flash ? "bg-emerald-500/15" : "",
      ].join(" ")}
    >
      {/* 보이는 칸(왼쪽): 누르면 상세 카드 */}
      <button
        type="button"
        className={[
          "no-select flex shrink-0 cursor-pointer items-center py-2 text-left text-white",
          ko
            ? "w-[44%] pr-2 text-sm leading-snug sm:text-base [overflow-wrap:anywhere]"
            : "w-[34%] truncate text-base sm:text-lg",
        ].join(" ")}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => onShowCard(word, e.clientX, e.clientY)}
      >
        <span className={ko ? "line-clamp-2" : "truncate"}>{promptText}</span>
      </button>

      {/* 정답(가림) 영역: 꾹 누르고 있으면 잠깐 보임.
          모바일에서 쉽게 눌리도록 세로로 행 전체 높이를 터치 판정으로 사용한다. */}
      <div
        className="no-select relative flex flex-1 cursor-pointer items-center py-2"
        style={{ touchAction: "none" }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setRevealed(true);
        }}
        onPointerUp={() => setRevealed(false)}
        onPointerCancel={() => setRevealed(false)}
      >
        <div className="grid w-full grid-cols-2 gap-4">
          <MaskedCell text={maskedLeft} revealed={revealed} className={ko ? "text-white" : "text-neutral-200"} />
          <MaskedCell text={maskedRight} revealed={revealed} className="text-neutral-300" />
        </div>
      </div>

      {/* 암기 체크 (토글) */}
      <div className="no-select flex w-[56px] shrink-0 items-center justify-center">
        <button
          type="button"
          aria-label={known ? "암기 해제" : "암기 완료"}
          aria-pressed={known}
          draggable={false}
          onClick={toggle}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: "manipulation" }}
          className={[
            "no-select grid h-8 w-8 place-items-center rounded-full text-sm transition active:scale-90",
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
    <span className="relative block">
      <span
        className={[
          "block truncate text-sm transition-opacity duration-200 sm:text-base",
          revealed ? "opacity-100" : "opacity-0",
          className,
        ].join(" ")}
      >
        {text}
      </span>
      <span
        aria-hidden
        className={[
          "absolute inset-y-1 left-0 right-0 rounded-[2px]",
          "bg-white/15",
          "transition-opacity duration-200",
          revealed ? "opacity-0" : "opacity-100",
        ].join(" ")}
      />
    </span>
  );
}
