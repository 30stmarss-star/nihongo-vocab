import type { ActivityLog, DailyPlan } from "../lib/daily";
import { dayKey, grassGrid, SPEAK_STEPS } from "../lib/daily";

/**
 * 홈 — 오늘의 코스(단어 → 작문 → 시험) + 스트릭/잔디/정복률.
 * 하루의 관문: 세 단계를 끝내고 시험을 통과하면 그날이 잔디에 심긴다.
 */

interface Stats {
  total: number;
  known: number;
  retired: number;
  pct: number;
}

interface Props {
  plan: DailyPlan;
  scenario: { emoji: string; title: string } | null; // 아직 안 정해졌으면 null(시작하면 공개)
  activity: ActivityLog;
  streak: number;
  stats: Stats;
  bandLabel: string;
  newCount: number;
  reviewCount: number;
  learnTotal: number;
  onStart: (step: "learn" | "speak" | "test") => void;
  onNewCycle: () => void;
}

export function Home({
  plan,
  scenario,
  activity,
  streak,
  stats,
  bandLabel,
  newCount,
  reviewCount,
  learnTotal,
  onStart,
  onNewCycle,
}: Props) {
  const today = dayKey();
  const speakReady = plan.speakDone || plan.speakSkipped;
  const testUnlocked = plan.learnDone && speakReady;
  const stepsDone = (plan.learnDone ? 1 : 0) + (speakReady ? 1 : 0) + (plan.testPassed ? 1 : 0);

  return (
    <div className="space-y-4 pb-4">
      {/* 인사 + 스트릭 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-mut">{today.replaceAll("-", ". ")}</div>
          <h2 className="text-xl font-extrabold text-ink">
            {plan.testPassed ? "오늘 목표 달성! 🎉" : "오늘의 목표를 끝내자!"}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 shadow-soft">
          <span className="text-lg">🔥</span>
          <span className="text-lg font-extrabold text-coral">{streak}</span>
          <span className="text-xs font-semibold text-mut">일 연속</span>
        </div>
      </div>

      {/* 오늘의 코스 */}
      <div className="rounded-3xl bg-card p-5 shadow-pop">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-ink">오늘의 코스</h3>
          <span className="text-xs font-bold text-mut">{stepsDone}/3 단계</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-base">
          <div
            className="h-full rounded-full bg-pri transition-all duration-500"
            style={{ width: `${(stepsDone / 3) * 100}%` }}
          />
        </div>

        <div className="mt-4 space-y-2.5">
          <StepRow
            emoji="🃏"
            gradient="linear-gradient(135deg,#8da2fb,#6b7ff2)"
            title="오늘의 단어"
            subtitle={`새 단어 ${newCount} · 복습 ${reviewCount}`}
            subtitleDone="눌러서 처음부터 다시 보기"
            state={
              plan.learnDone
                ? { kind: "done" }
                : plan.learnIndex > 0
                  ? { kind: "progress", label: `${Math.min(plan.learnIndex + 1, learnTotal)}/${learnTotal} 이어하기` }
                  : { kind: "todo", label: "시작" }
            }
            onClick={() => onStart("learn")}
          />
          <StepRow
            emoji={scenario?.emoji ?? "🎁"}
            gradient="linear-gradient(135deg,#fb9c8b,#f4695b)"
            title="작문 스피킹"
            subtitle={
              scenario
                ? `${scenario.title} 상황 · ${SPEAK_STEPS}문장`
                : `시작하면 오늘의 상황 공개 · ${SPEAK_STEPS}문장`
            }
            state={
              plan.speakDone
                ? { kind: "done" }
                : plan.speakSkipped
                  ? { kind: "done", label: "건너뜀" }
                  : plan.speakStep > 0
                    ? { kind: "progress", label: `${plan.speakStep}/${SPEAK_STEPS} 이어하기` }
                    : { kind: "todo", label: "시작" }
            }
            onClick={() => onStart("speak")}
          />
          <StepRow
            emoji="📝"
            gradient="linear-gradient(135deg,#a78bfa,#7c5ce8)"
            title="데일리 시험"
            subtitle={plan.testPassed ? `통과! ${plan.bestScore ?? ""}점` : "90점 이상이면 통과"}
            locked={!testUnlocked}
            state={
              plan.testPassed
                ? { kind: "done" }
                : testUnlocked
                  ? { kind: "todo", label: "도전" }
                  : { kind: "locked" }
            }
            onClick={() => testUnlocked && onStart("test")}
          />
        </div>

        {plan.testPassed && (
          <button
            onClick={onNewCycle}
            className="mt-4 w-full rounded-2xl bg-pri py-3.5 font-bold text-white shadow-soft transition hover:bg-pri-deep active:scale-95"
          >
            새 사이클 시작 (내일 몫 미리 하기) →
          </button>
        )}
      </div>

      {/* 잔디 */}
      <div className="rounded-3xl bg-card p-5 shadow-soft">
        <div className="flex items-baseline justify-between">
          <h3 className="font-extrabold text-ink">달성 잔디</h3>
          <span className="text-xs text-mut">최근 12주 · 진한 칸 = 시험 통과</span>
        </div>
        <div className="mx-auto mt-3 flex w-full max-w-sm justify-between gap-[3px]">
          {grassGrid(12).map((week, wi) => (
            <div key={wi} className="flex flex-1 flex-col gap-[3px]">
              {week.map((d) => {
                const done = activity.done[d] != null;
                const accessed = activity.access[d] != null;
                const future = d > today;
                const isToday = d === today;
                return (
                  <div
                    key={d}
                    title={d}
                    className={[
                      "aspect-square w-full rounded-[4px]",
                      future ? "bg-transparent" : done ? "bg-pri" : accessed ? "bg-pri/30" : "bg-base",
                      isToday ? "ring-2 ring-coral" : "",
                    ].join(" ")}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 정복률 */}
      <div className="rounded-3xl bg-card p-5 shadow-soft">
        <div className="flex items-baseline justify-between">
          <h3 className="font-extrabold text-ink">{bandLabel} 정복률</h3>
          <span className="text-lg font-extrabold text-pri-deep">{stats.pct}%</span>
        </div>
        <div className="mt-2.5 h-3.5 overflow-hidden rounded-full bg-base">
          <div className="flex h-full">
            <div
              className="h-full bg-gold transition-all duration-500"
              style={{ width: `${stats.total ? (stats.retired / stats.total) * 100 : 0}%` }}
              title="완전 암기"
            />
            <div
              className="h-full bg-pri transition-all duration-500"
              style={{ width: `${stats.total ? (stats.known / stats.total) * 100 : 0}%` }}
              title="외운 단어"
            />
          </div>
        </div>
        <div className="mt-2 flex gap-4 text-xs font-semibold text-sub">
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-gold" />
            완전 암기 {stats.retired}
          </span>
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-pri" />
            외움 {stats.known}
          </span>
          <span className="ml-auto text-mut">전체 {stats.total}</span>
        </div>
      </div>
    </div>
  );
}

type StepState =
  | { kind: "done"; label?: string }
  | { kind: "progress"; label: string }
  | { kind: "todo"; label: string }
  | { kind: "locked"; label?: string };

function StepRow({
  emoji,
  gradient,
  title,
  subtitle,
  subtitleDone,
  state,
  locked,
  onClick,
}: {
  emoji: string;
  gradient: string;
  title: string;
  subtitle: string;
  subtitleDone?: string; // 완료 뒤에는 다른 안내를 보여준다
  state: StepState;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      className={[
        "flex w-full items-center gap-3.5 rounded-2xl border-2 p-3 text-left transition active:scale-[0.98]",
        locked
          ? "cursor-not-allowed border-line bg-base/60 opacity-60"
          : state.kind === "done"
            ? "border-mint/40 bg-mint-soft/50"
            : "border-line bg-card hover:border-pri/50 hover:bg-pri-soft/30",
      ].join(" ")}
    >
      <span
        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl shadow-soft"
        style={{ background: locked ? "var(--color-line)" : gradient }}
      >
        {locked ? "🔒" : emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink">{title}</span>
        <span className="block truncate text-xs font-medium text-sub">
          {state.kind === "done" && subtitleDone ? subtitleDone : subtitle}
        </span>
      </span>
      {state.kind === "done" ? (
        <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-bold text-white">✓ {state.label ?? "완료"}</span>
      ) : state.kind === "progress" ? (
        <span className="rounded-full bg-gold-soft px-2.5 py-1 text-xs font-bold text-gold">{state.label}</span>
      ) : state.kind === "todo" ? (
        <span className="rounded-full bg-pri px-3 py-1 text-xs font-bold text-white">{state.label}</span>
      ) : (
        <span className="text-xs font-bold text-mut">잠김</span>
      )}
    </button>
  );
}
