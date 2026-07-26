import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Word } from "../data/types";
import { boundPrefix } from "../data/types";
import { isRetired, type Progress } from "../lib/srs";

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
  onRetire: (id: string) => void;
  onUnretire: (id: string) => void;
  mode?: Mode;
}

export function WordTable(props: Props) {
  const ko = props.mode === "ko";
  return (
    <div className="overflow-hidden rounded-3xl bg-card shadow-soft">
      {/* 헤더 */}
      <div className="flex items-center border-b border-line px-3 py-3 text-xs font-bold tracking-wide text-mut">
        <div className="w-11 shrink-0 text-center">암기</div>
        <div className="w-[34%] shrink-0 pl-1">{ko ? "뜻" : "단어"}</div>
        <div className="grid flex-1 grid-cols-2 gap-2">
          <span>{ko ? "단어" : "독음(히라가나)"}</span>
          <span>{ko ? "독음(히라가나)" : "뜻"}</span>
        </div>
      </div>

      <ul>
        {props.words.map((w) => (
          <WordRow key={w.id} word={w} {...props} />
        ))}
      </ul>
    </div>
  );
}

/** 뜻→단어 모드의 문제(한국어 뜻)에서 괄호 보충설명을 뗀다. 상세 카드에는 그대로 남는다. */
function stripParens(text: string): string {
  const bare = text.replace(/\s*[（(][^）)]*[）)]/g, "").trim();
  return bare || text;
}

function WordRow({
  word,
  progress,
  onShowCard,
  onRetire,
  onUnretire,
  mode = "jp",
}: { word: Word } & Omit<Props, "words">) {
  const [revealed, setRevealed] = useState(false);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | undefined>(undefined);
  // 따닥(더블탭) 체크: 단어를 빠르게 두 번 탭하면 체크 토글 (한 손 조작용).
  // 첫 탭은 300ms 뒤에 카드를 띄우고, 그 안에 두 번째 탭이 오면 카드 대신 체크.
  // (카드를 즉시 띄우면 전체 화면 '카드 닫기' 오버레이가 두 번째 탭을 삼킨다)
  const tapTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(tapTimer.current), []);

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
  const retired = isRetired(p); // 완전 암기
  const ko = mode === "ko";

  // 후행 결합형(예: ~ながら)이면 일본어 표제어·독음 앞에 ~를 붙인다.
  const pre = boundPrefix(word);
  const jpKanji = pre + word.kanji;
  const jpKana = pre + word.kana;

  // 보이는 칸(왼쪽)과 가려진 칸(오른쪽)을 모드에 따라 바꾼다.
  const promptText = ko ? stripParens(word.meaning) : jpKanji;
  const maskedLeft = ko ? jpKanji : jpKana; // 가려진 첫 칸
  const maskedRight = ko ? jpKana : word.meaning; // 가려진 둘째 칸

  // 단일 토글: 없음 ↔ 완전 암기(금색). 해제해도 숙련도는 유지된다.
  function toggle() {
    if (retired) {
      onUnretire(word.id);
      return;
    }
    onRetire(word.id);
    setFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 650);
  }

  return (
    <li
      className={[
        "relative flex min-h-[3.25rem] items-stretch px-3 py-1.5 transition-colors",
        "border-b border-line last:border-0",
        retired ? "bg-gold-soft/60" : "",
        flash ? "bg-gold-soft" : "",
      ].join(" ")}
    >
      {/* 완전 암기 체크: 행 맨 왼쪽. 누르면 금색(다시 복습에 안 나옴), 한 번 더 누르면 해제. */}
      <div className="no-select relative z-20 flex w-11 shrink-0 items-stretch">
        <button
          type="button"
          aria-label={retired ? "완전 암기 해제" : "완전 암기로 표시"}
          aria-pressed={retired}
          draggable={false}
          onClick={toggle}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: "manipulation" }}
          className="group no-select flex h-full w-full cursor-pointer items-center justify-center transition active:scale-95"
        >
          <span
            className={[
              "grid h-7 w-7 place-items-center rounded-full text-sm font-bold transition",
              retired
                ? "bg-gold text-white shadow-[0_0_10px_2px_rgba(237,162,58,0.45)] ring-2 ring-gold/50"
                : "border-2 border-line text-transparent group-hover:border-gold/70",
            ].join(" ")}
          >
            ✓
          </span>
        </button>
      </div>

      {/* 문제 칸(고정폭, 정렬 유지). 빈 공간은 오버레이로 통과(pointer-events-none),
          글자만 위(z-20)로 빼서 누르면 상세 카드가 뜬다. */}
      <div
        className="no-select pointer-events-none relative flex w-[34%] shrink-0 items-stretch pl-1 pr-2"
      >
        <button
          type="button"
          className={[
            "no-select pointer-events-auto relative z-20 flex min-w-0 max-w-full cursor-pointer items-center py-2.5 text-left font-semibold leading-snug text-ink",
            ko ? "text-sm sm:text-base" : "text-base sm:text-lg",
          ].join(" ")}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => {
            const { clientX, clientY } = e;
            if (tapTimer.current !== undefined) {
              // 따닥: 두 번째 탭 → 카드 대신 체크 토글
              window.clearTimeout(tapTimer.current);
              tapTimer.current = undefined;
              toggle();
            } else {
              tapTimer.current = window.setTimeout(() => {
                tapTimer.current = undefined;
                onShowCard(word, clientX, clientY);
              }, 300);
            }
          }}
        >
          <span className="line-clamp-2 [overflow-wrap:anywhere]">
            {promptText}
          </span>
        </button>
      </div>

      {/* 오른쪽: 가림 셀만. 오버레이 아래에 있어 누르면 꾹 눌러 공개로 동작하고,
          화면 오른쪽 가장자리 어디를 눌러도 체크와 무관하다. */}
      <div className="relative flex flex-1 items-center py-2.5">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:gap-4">
          <MaskedCell text={maskedLeft} revealed={revealed} className="text-ink font-semibold" />
          <MaskedCell text={maskedRight} revealed={revealed} className="text-ink font-medium" />
        </div>
      </div>

      {/* 투명 press-hold 오버레이: 글자·체크(z-20)를 뺀 행 전체를 덮는다.
          '보이는 가림막'과 똑같은 방식으로 눌러서 공개하되, 히트 영역만 왼쪽 빈 공간까지 넓힌 것. */}
      <div className="no-select absolute inset-0 z-10 cursor-pointer" {...revealHandlers} />

      {/* 암기 체크 시 살짝 떠오르는 피드백 */}
      {flash && (
        <span
          className={[
            "pointer-events-none absolute left-12 top-1 z-30 animate-[floatUp_0.65s_ease-out] text-sm font-bold",
            "text-gold",
          ].join(" ")}
        >
          ⭐ 완전 암기!
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
          "block [overflow-wrap:anywhere] text-sm transition-opacity duration-200 sm:text-base",
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
          "bg-[#d9def0]",
          "transition-opacity duration-200",
          revealed ? "opacity-0" : "opacity-100",
        ].join(" ")}
      />
    </span>
  );
}
