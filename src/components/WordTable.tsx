import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Word } from "../data/types";
import { boundPrefix } from "../data/types";
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

  // 정답 공개(press-hold): 지금 잘 작동하는 '가림막'과 동일한 방식.
  // 아래 <li> 전체를 덮는 투명 오버레이 하나에만 이 핸들러를 달아, 가림막 모양은 그대로 두고
  // 눌리는 영역만 왼쪽 빈 공간까지 넓힌다. 글자(카드)·체크(✓)만 오버레이 위로 빼서 각자 동작.
  const startPt = useRef<{ x: number; y: number } | null>(null);
  function revealDown(e: ReactPointerEvent) {
    startPt.current = { x: e.clientX, y: e.clientY };
    setRevealed(true);
  }
  function revealMove(e: ReactPointerEvent) {
    const s = startPt.current;
    if (!s) return;
    // 세로로 드래그해 스크롤하려는 거면 공개를 닫는다.
    if (Math.abs(e.clientX - s.x) > 12 || Math.abs(e.clientY - s.y) > 12) revealEnd();
  }
  function revealEnd() {
    startPt.current = null;
    setRevealed(false);
  }
  const revealHandlers = {
    onPointerDown: revealDown,
    onPointerMove: revealMove,
    onPointerUp: revealEnd,
    onPointerCancel: revealEnd,
    onPointerLeave: revealEnd,
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
    style: { touchAction: "pan-y" as const },
  };

  const p = progress[word.id];
  const known = !!p && p.seenCount > 0 && p.mastery >= 1;
  const ko = mode === "ko";

  // 후행 결합형(예: ~ながら)이면 일본어 표제어·독음 앞에 ~를 붙인다.
  const pre = boundPrefix(word);
  const jpKanji = pre + word.kanji;
  const jpKana = pre + word.kana;

  // 보이는 칸(왼쪽)과 가려진 칸(오른쪽)을 모드에 따라 바꾼다.
  const promptText = ko ? word.meaning : jpKanji;
  const maskedLeft = ko ? jpKanji : jpKana; // 가려진 첫 칸
  const maskedRight = ko ? jpKana : word.meaning; // 가려진 둘째 칸

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
        "relative flex min-h-[3.25rem] items-stretch px-3 py-1.5 transition-colors",
        "border-b border-white/5 last:border-0",
        known ? "bg-emerald-500/[0.07]" : "",
        flash ? "bg-emerald-500/15" : "",
      ].join(" ")}
    >
      {/* 왼쪽 고정폭 칸(정렬 유지). 빈 공간은 오버레이로 통과(pointer-events-none),
          글자만 위(z-20)로 빼서 누르면 상세 카드가 뜬다. */}
      <div
        className={[
          "no-select pointer-events-none relative flex shrink-0 items-stretch",
          ko ? "w-[44%] pr-2" : "w-[34%]",
        ].join(" ")}
      >
        <button
          type="button"
          className={[
            "no-select pointer-events-auto relative z-20 flex min-w-0 max-w-full cursor-pointer items-center py-2.5 text-left text-white",
            ko ? "text-sm leading-snug sm:text-base" : "text-base sm:text-lg",
          ].join(" ")}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => onShowCard(word, e.clientX, e.clientY)}
        >
          <span className={ko ? "line-clamp-2 [overflow-wrap:anywhere]" : "truncate"}>
            {promptText}
          </span>
        </button>
      </div>

      {/* 오른쪽: 가림 셀(그대로) + 체크. 가림 셀은 오버레이 아래에 있어 눌러도 오버레이가 공개를 처리.
          체크(✓)만 위(z-20)로 빼서 암기 표시를 담당한다. */}
      <div className="relative flex flex-1 items-center py-2.5">
        <div className="grid flex-1 grid-cols-2 gap-4">
          <MaskedCell text={maskedLeft} revealed={revealed} className={ko ? "text-white" : "text-neutral-200"} />
          <MaskedCell text={maskedRight} revealed={revealed} className="text-neutral-300" />
        </div>

        <div className="no-select relative z-20 flex w-[56px] shrink-0 items-center justify-center">
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
      </div>

      {/* 투명 press-hold 오버레이: 글자·체크(z-20)를 뺀 행 전체를 덮는다.
          '보이는 가림막'과 똑같은 방식으로 눌러서 공개하되, 히트 영역만 왼쪽 빈 공간까지 넓힌 것. */}
      <div className="no-select absolute inset-0 z-10 cursor-pointer" {...revealHandlers} />

      {/* 암기 체크 시 살짝 떠오르는 피드백 */}
      {flash && (
        <span className="pointer-events-none absolute right-16 top-1 z-30 animate-[floatUp_0.65s_ease-out] text-sm text-emerald-400">
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
          "absolute inset-y-0 left-0 right-0 rounded-md",
          "bg-white/15",
          "transition-opacity duration-200",
          revealed ? "opacity-0" : "opacity-100",
        ].join(" ")}
      />
    </span>
  );
}
