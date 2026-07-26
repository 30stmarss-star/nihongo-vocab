import { useEffect, useState } from "react";
import type { Word } from "../data/types";
import { loadSpeakLogs, type SpeakLog } from "../lib/daily";
import { EvalCard } from "./Speaking";

/**
 * 지난 작문 기록. 목록에서 하나 고르면 그날 나눈 대화를 그대로 다시 읽는다.
 * 모범답안·실전 팁·문법 분해가 그대로 남아 있어 복습 자료가 된다.
 */
export function SpeakingLog({
  userId,
  dictionary,
  onShowCard,
}: {
  userId: string | null;
  dictionary: Word[];
  onShowCard: (word: Word, x: number, y: number) => void;
}) {
  const [logs, setLogs] = useState<SpeakLog[] | null>(null);
  const [open, setOpen] = useState<SpeakLog | null>(null);

  useEffect(() => {
    void loadSpeakLogs(userId).then(setLogs);
  }, [userId]);

  if (logs === null) {
    return <div className="px-6 py-14 text-center text-sm text-mut">기록을 불러오는 중…</div>;
  }

  if (open) {
    const answered = open.turns.filter((t) => t.eval).length;
    return (
      <div className="pb-4">
        <button
          onClick={() => setOpen(null)}
          className="mb-3 text-sm font-semibold text-sub transition hover:text-ink"
        >
          ← 기록 목록
        </button>

        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full bg-coral-soft px-3 py-1 text-sm font-bold text-coral">
            {open.scenario ? `${open.scenario.emoji} ${open.scenario.title}` : "🎤 작문"}
          </span>
          <span className="text-xs text-mut">
            {open.day.replaceAll("-", ". ")} · {answered}문장
          </span>
        </div>

        <div className="space-y-3">
          {open.intro && (
            <div className="rounded-2xl bg-pri-soft px-4 py-3 text-sm leading-relaxed text-pri-deep">
              🎬 {open.intro}
            </div>
          )}
          {open.turns.map((t, i) => (
            <div key={i} className="space-y-3">
              <div className="flex gap-2">
                <span className="mt-0.5 text-lg">{t.role === "me" ? "🙋" : "🎭"}</span>
                <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-card px-4 py-3 text-sm leading-relaxed text-ink shadow-soft">
                  <div className="mb-1 text-[11px] font-bold text-mut">
                    {t.role === "me" ? "내 차례" : "상대방 차례 (내가 작문)"}
                  </div>
                  {t.instruction}
                </div>
              </div>
              {t.input && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-pri px-4 py-3 text-sm leading-relaxed text-white shadow-soft">
                    {t.input}
                  </div>
                </div>
              )}
              {t.eval && <EvalCard turn={t} dictionary={dictionary} onShowCard={onShowCard} />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!logs.length) {
    return (
      <div className="rounded-3xl bg-card px-6 py-14 text-center text-sm text-mut shadow-soft">
        아직 작문 기록이 없어요.
        <br />
        하루 코스의 작문 스피킹을 하면 여기에 쌓여요.
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-4">
      <p className="px-1 text-xs text-mut">
        지난 작문 {logs.length}개. 모범답안과 문법 해설이 그대로 남아 있어요.
      </p>
      {logs.map((l) => {
        const answered = l.turns.filter((t) => t.eval).length;
        return (
          <button
            key={l.id}
            onClick={() => setOpen(l)}
            className="flex w-full items-center gap-3.5 rounded-2xl bg-card p-3.5 text-left shadow-soft transition hover:shadow-pop active:scale-[0.99]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-coral-soft text-xl">
              {l.scenario?.emoji ?? "🎤"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-ink">{l.scenario?.title ?? "작문"}</span>
              <span className="block truncate text-xs text-sub">
                {l.day.replaceAll("-", ". ")} · {answered}문장 {l.done ? "· 완료" : "· 진행 중"}
              </span>
            </span>
            <span className="text-sm text-mut">›</span>
          </button>
        );
      })}
    </div>
  );
}
