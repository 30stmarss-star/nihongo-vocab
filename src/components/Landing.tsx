import type { DailyPlan } from "../lib/daily";
import { dayKey, SPEAK_STEPS } from "../lib/daily";

/**
 * 랜딩 — 무엇을 할지부터 고른다.
 *
 * 하루 코스와 만화 읽기는 성격이 다른 활동이라 한 화면에 섞으면 둘 다 흐려진다.
 * 여기서 갈라두고, 고른 쪽은 그 모드 전용 화면·네비로 들어간다.
 * 단어장은 두 모드가 같은 것을 본다 — 어디서 주웠든 내 단어는 한 곳에 쌓인다.
 */

export type Mode = "pick" | "course" | "manga";

interface Props {
  plan: DailyPlan;
  streak: number;
  bandLabel: string;
  onPick: (mode: Exclude<Mode, "pick">) => void;
}

export function Landing({ plan, streak, bandLabel, onPick }: Props) {
  const speakReady = plan.speakDone || plan.speakSkipped;
  const stepsDone = (plan.learnDone ? 1 : 0) + (speakReady ? 1 : 0) + (plan.testPassed ? 1 : 0);
  const today = dayKey();

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-mut">{today.replaceAll("-", ". ")}</div>
          <h2 className="text-xl font-extrabold text-ink">오늘은 뭐 할까요?</h2>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 shadow-soft">
          <span className="text-lg">🔥</span>
          <span className="text-lg font-extrabold text-coral">{streak}</span>
          <span className="text-xs font-semibold text-mut">일 연속</span>
        </div>
      </div>

      {/* 하루 코스 */}
      <button
        onClick={() => onPick("course")}
        className="w-full rounded-3xl bg-card p-5 text-left shadow-pop transition hover:shadow-pop active:scale-[0.99]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-3xl leading-none">📚</div>
            <h3 className="mt-2.5 text-lg font-extrabold text-ink">하루 코스</h3>
            <p className="mt-0.5 text-sm text-sub">단어 → 작문 → 시험</p>
          </div>
          <span className="shrink-0 rounded-full bg-page px-2.5 py-1 text-[11px] font-bold text-sub">
            {bandLabel}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2.5">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-page">
            <div
              className="h-full rounded-full bg-pri transition-all duration-500"
              style={{ width: `${(stepsDone / 3) * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-bold text-mut">
            {plan.testPassed ? "오늘 달성 🎉" : `${stepsDone}/3 단계`}
          </span>
        </div>
      </button>

      {/* 만화로 읽기 */}
      <button
        onClick={() => onPick("manga")}
        className="w-full rounded-3xl bg-card p-5 text-left shadow-soft transition hover:shadow-pop active:scale-[0.99]"
      >
        <div className="text-3xl leading-none">📖</div>
        <h3 className="mt-2.5 text-lg font-extrabold text-ink">만화로 읽기</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-sub">
          원서 읽다 막힌 페이지를 넣으면
          <br />
          대사·어휘·한자를 풀어서 보여줘요.
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-pri-soft px-3 py-1.5 text-xs font-bold text-pri-deep">
          휴대폰 스크린샷으로도 읽기 →
        </div>
      </button>

      {plan.speakScenario && !speakReady && (
        <p className="px-1 text-xs text-mut">
          오늘 작문 상황: {plan.speakScenario.emoji} {plan.speakScenario.title} ·{" "}
          {plan.speakStep}/{SPEAK_STEPS}
        </p>
      )}
    </div>
  );
}
