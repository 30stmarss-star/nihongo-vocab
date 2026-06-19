import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CONFUSABLE_GROUPS, type ConfusableGroup, type ConfusableKanji } from "../data/confusables";
import { loadConfusableMemorized, saveConfusableMemorized } from "../lib/storage";

/**
 * 닮은꼴 한자 비교 카드.
 *  - 한자와 구별 포인트(distinguish_ko)는 항상 보인다(레퍼런스).
 *  - 뜻·읽기·예문 후리가나는 가려져 있고, 그룹을 꾹 누르면 그 묶음 전체가 한꺼번에 드러난다.
 *  - 묶음을 ✓로 체크하면 '외운 묶음'으로 옮겨져 학습 목록에서 숨겨지고, 따로 모아 볼 수 있다.
 */
export function ConfusableCards({ userId }: { userId: string | null }) {
  const [memorized, setMemorized] = useState<Set<string>>(() => new Set());
  const [showMemorized, setShowMemorized] = useState(false);

  // 유저(기기)별 외운 묶음 불러오기
  useEffect(() => {
    setMemorized(new Set(loadConfusableMemorized(userId)));
  }, [userId]);

  function toggleMemorized(groupId: string) {
    setMemorized((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      saveConfusableMemorized(userId, [...next]);
      return next;
    });
  }

  const studyGroups = useMemo(
    () => CONFUSABLE_GROUPS.filter((g) => !memorized.has(g.group_id)),
    [memorized]
  );
  const memorizedGroups = useMemo(
    () => CONFUSABLE_GROUPS.filter((g) => memorized.has(g.group_id)),
    [memorized]
  );
  const list = showMemorized ? memorizedGroups : studyGroups;

  return (
    <div className="space-y-3">
      {/* 공부할 묶음 / 외운 묶음 전환 */}
      <div className="flex gap-1 rounded-xl bg-neutral-900 p-1 text-sm">
        <button
          onClick={() => setShowMemorized(false)}
          className={`flex-1 rounded-lg px-3 py-1.5 transition ${
            !showMemorized ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          공부할 묶음 {studyGroups.length}
        </button>
        <button
          onClick={() => setShowMemorized(true)}
          className={`flex-1 rounded-lg px-3 py-1.5 transition ${
            showMemorized ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          외운 묶음 {memorizedGroups.length}
        </button>
      </div>

      <p className="text-xs text-neutral-500">
        헷갈리기 쉬운 한자를 묶었어요. <b className="text-neutral-300">구별 포인트</b>를 보고,
        그룹을 <b className="text-neutral-300">꾹 누르면</b> 뜻·읽기가 한꺼번에 드러나요.
        다 외운 묶음은 <span className="text-emerald-300">✓</span> 로 체크하면 따로 모여요.{" "}
        <span className="text-neutral-600">(히라가나=훈독, 카타카나=음독)</span>
      </p>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-neutral-950/60 px-6 py-12 text-center text-sm text-neutral-500">
          {showMemorized
            ? "아직 외운 묶음이 없어요. 묶음을 ✓ 로 체크하면 여기에 모여요."
            : "모든 묶음을 외웠어요! 🎉"}
        </div>
      ) : (
        list.map((g) => (
          <GroupCard
            key={g.group_id}
            g={g}
            memorized={memorized.has(g.group_id)}
            onToggleMemorized={() => toggleMemorized(g.group_id)}
          />
        ))
      )}
    </div>
  );
}

function GroupCard({
  g,
  memorized,
  onToggleMemorized,
}: {
  g: ConfusableGroup;
  memorized: boolean;
  onToggleMemorized: () => void;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <section
      className={[
        "overflow-hidden rounded-2xl border bg-neutral-950/60",
        memorized ? "border-emerald-500/30" : "border-white/10",
      ].join(" ")}
    >
      {/* 헤더: 라벨 + 외움 체크 */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="min-w-0 flex-1 text-sm font-semibold text-white">{g.group_label}</span>
        <button
          type="button"
          aria-label={memorized ? "외움 해제" : "외움 완료"}
          aria-pressed={memorized}
          onClick={onToggleMemorized}
          style={{ touchAction: "manipulation" }}
          className={[
            "no-select grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm transition active:scale-90",
            memorized
              ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/40"
              : "border border-white/25 text-transparent hover:border-emerald-400/70",
          ].join(" ")}
        >
          ✓
        </button>
      </div>

      {/* 그룹 전체가 하나의 꾹누르기 영역: 누르는 동안 묶음 전체가 드러남 */}
      <div
        className="no-select cursor-pointer"
        style={{ touchAction: "none" }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setRevealed(true);
        }}
        onPointerUp={() => setRevealed(false)}
        onPointerCancel={() => setRevealed(false)}
      >
        <ul className="divide-y divide-white/5">
          {g.kanji.map((k) => (
            <KanjiEntry key={k.kanji} k={k} revealed={revealed} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function KanjiEntry({ k, revealed }: { k: ConfusableKanji; revealed: boolean }) {
  return (
    <li className="flex items-stretch gap-3 px-4 py-3">
      {/* 한자: 항상 보임 */}
      <div className="flex w-[56px] shrink-0 items-center justify-center">
        <span className="text-4xl leading-none text-white">{k.kanji}</span>
      </div>

      <div className="min-w-0 flex-1">
        {/* 구별 포인트: 항상 */}
        <div className="text-xs leading-snug text-amber-300/90">{k.distinguish_ko}</div>

        {/* 읽기 · 뜻: 가림 */}
        <Mask revealed={revealed} className="mt-1.5">
          <span className="text-base text-neutral-100">{k.reading_key}</span>
          <span className="mx-1.5 text-neutral-600">·</span>
          <span className="text-base text-emerald-300">{k.meaning_ko}</span>
        </Mask>

        {/* 예문: 단어는 항상, 후리가나·뜻은 가림 */}
        <div className="mt-1.5 text-sm leading-snug">
          <span className="text-xs text-neutral-500">예)</span>{" "}
          <span className="text-neutral-200">{k.example.word}</span>{" "}
          <Mask revealed={revealed} inline>
            <span className="text-neutral-400">{k.example.reading}</span>
          </Mask>{" "}
          <span className="text-neutral-600">·</span>{" "}
          <Mask revealed={revealed} inline>
            <span className="text-neutral-400">{k.example.meaning_ko}</span>
          </Mask>
        </div>
      </div>
    </li>
  );
}

/** 가려져 있다가 revealed일 때 내용이 드러나는 칸. inline이면 글자 폭만큼만 가린다. */
function Mask({
  revealed,
  className,
  inline,
  children,
}: {
  revealed: boolean;
  className?: string;
  inline?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={[
        "relative",
        inline ? "inline-block align-baseline" : "block min-h-[1.75rem] py-1",
        className ?? "",
      ].join(" ")}
    >
      <span
        className={[
          "transition-opacity duration-200",
          inline ? "inline-block" : "block",
          revealed ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {children}
      </span>
      <span
        aria-hidden
        className={[
          "absolute inset-0 rounded-md bg-white/10 transition-opacity duration-200",
          revealed ? "opacity-0" : "opacity-100",
        ].join(" ")}
      />
    </span>
  );
}
