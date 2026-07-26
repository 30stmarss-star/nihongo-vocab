import { useEffect, useRef, useState } from "react";
import type { Word } from "../data/types";
import type { SpeakTurn } from "../lib/daily";
import { SPEAK_STEPS } from "../lib/daily";
import { supabase } from "../lib/supabase";
import { JpText } from "./JpText";

/** 오늘의 상황 — Claude가 매 사이클 새로 창작한다 */
export interface SpeakScenario {
  emoji: string;
  title: string;
  desc: string;
}

/**
 * 작문 스피킹 — 상황 롤플레이. 내 대사와 상대방 대사를 모두 한글 음차로 작문한다.
 * 지시(한국어) → 작문 → 즉시 평가(모범 답안·실전 팁·문법 분해) → 다음 지시.
 * 모범 답안 속 단어를 탭하면 상세 카드가 뜬다.
 */

interface Props {
  scenario: SpeakScenario | null; // null이면 서버가 새 상황을 창작한다
  recentTitles: string[]; // 최근에 나온 상황 제목(반복 방지)
  level: string;
  focusWords: Word[]; // 오늘 새 단어 중 몇 개를 대화에 녹인다
  dictionary: Word[]; // 탭해서 카드 볼 수 있는 단어 풀
  initialIntro?: string;
  initialTurns?: SpeakTurn[];
  onScenario: (s: SpeakScenario) => void; // 창작된 상황 저장(이어하기용)
  onState: (intro: string, turns: SpeakTurn[], answered: number) => void;
  onDone: () => void;
  onSkip: () => void;
  onExit: () => void;
  onShowCard: (word: Word, x: number, y: number) => void;
}

export function Speaking(props: Props) {
  const { level, focusWords, onState, onDone, onSkip, onExit } = props;
  const [scenario, setScenario] = useState<SpeakScenario | null>(props.scenario);
  const [intro, setIntro] = useState(props.initialIntro ?? "");
  const [turns, setTurns] = useState<SpeakTurn[]>(props.initialTurns ?? []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const answered = turns.filter((t) => t.eval).length;
  const current = turns.find((t) => !t.eval) ?? null;
  const finished = answered >= SPEAK_STEPS;

  const focusPayload = focusWords.map((w) => ({ jp: w.kanji, kana: w.kana, ko: w.meaning }));

  function persist(nextIntro: string, nextTurns: SpeakTurn[]) {
    onState(nextIntro, nextTurns, nextTurns.filter((t) => t.eval).length);
  }

  async function invoke(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!supabase) throw new Error("클라우드 모드에서만 사용할 수 있어요.");
    const { data, error: err } = await supabase.functions.invoke("speaking-roleplay", { body });
    if (err) throw err;
    if (data?.error) throw new Error(String(data.error));
    return data as Record<string, unknown>;
  }

  async function start() {
    setLoading(true);
    setError("");
    try {
      const data = await invoke({
        mode: "start",
        scenario: scenario ? { title: scenario.title, desc: scenario.desc } : null,
        recent: props.recentTitles,
        level,
        focusWords: focusPayload,
      });
      const s = data.scenario as SpeakScenario | undefined;
      if (s?.title) {
        const scen = { emoji: s.emoji || "🎤", title: s.title, desc: s.desc || "" };
        setScenario(scen);
        props.onScenario(scen);
      }
      const nextIntro = String(data.intro ?? "");
      const nextTurns: SpeakTurn[] = [{ role: "me", instruction: String(data.instruction ?? "") }];
      setIntro(nextIntro);
      setTurns(nextTurns);
      persist(nextIntro, nextTurns);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!started.current && turns.length === 0) {
      started.current = true;
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  async function submit() {
    if (!current || !input.trim() || loading) return;
    const myInput = input.trim();
    setLoading(true);
    setError("");
    try {
      const willBeAnswered = answered + 1;
      const nextRole =
        willBeAnswered < SPEAK_STEPS ? (current.role === "me" ? "partner" : "me") : null;
      const data = await invoke({
        mode: "answer",
        scenario: scenario ? { title: scenario.title, desc: scenario.desc } : null,
        level,
        focusWords: focusPayload,
        history: turns
          .filter((t) => t.eval)
          .map((t) => ({ role: t.role, instruction: t.instruction, input: t.input, correctJp: t.eval!.correctJp })),
        role: current.role,
        instruction: current.instruction,
        input: myInput,
        nextRole,
      });
      const ev = {
        understood: String(data.understood ?? ""),
        verdict: (["great", "ok", "retry"].includes(String(data.verdict)) ? data.verdict : "ok") as "great" | "ok" | "retry",
        correctJp: String(data.correctJp ?? ""),
        correctKana: String(data.correctKana ?? ""),
        correctKo: String(data.correctKo ?? ""),
        feedback: String(data.feedback ?? ""),
      };
      const nextTurns = turns.map((t) => (t === current ? { ...t, input: myInput, eval: ev } : t));
      const ni = data.nextInstruction;
      if (nextRole && typeof ni === "string" && ni) {
        nextTurns.push({ role: nextRole, instruction: ni });
      }
      setTurns(nextTurns);
      setInput("");
      persist(intro, nextTurns);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col px-5 pt-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button onClick={onExit} aria-label="나가기" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card text-sub shadow-soft">
          ✕
        </button>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-card shadow-inner">
          <div
            className="h-full rounded-full bg-coral transition-all duration-300"
            style={{ width: `${(answered / SPEAK_STEPS) * 100}%` }}
          />
        </div>
        <span className="w-12 text-right text-sm font-semibold text-sub">
          {answered}/{SPEAK_STEPS}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="rounded-full bg-coral-soft px-3 py-1 text-sm font-bold text-coral">
          {scenario ? `${scenario.emoji} ${scenario.title}` : "🎁 오늘의 상황은…"}
        </span>
        <span className="text-xs text-mut">내 대사도, 상대방 대사도 직접 작문!</span>
      </div>

      {/* 대화 스레드 */}
      <div ref={scrollRef} className="mt-3 flex-1 space-y-3 overflow-y-auto pb-4">
        {intro && (
          <div className="rounded-2xl bg-pri-soft px-4 py-3 text-sm leading-relaxed text-pri-deep">
            🎬 {intro}
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className="space-y-3">
            {/* 지시 */}
            <div className="flex gap-2">
              <span className="mt-0.5 text-lg">{t.role === "me" ? "🙋" : "🎭"}</span>
              <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-card px-4 py-3 text-sm leading-relaxed text-ink shadow-soft">
                <div className="mb-1 text-[11px] font-bold text-mut">
                  {t.role === "me" ? "내 차례" : "상대방 차례 (내가 작문)"}
                </div>
                {t.instruction}
              </div>
            </div>

            {/* 내가 쓴 답 */}
            {t.input && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-pri px-4 py-3 text-sm leading-relaxed text-white shadow-soft">
                  {t.input}
                </div>
              </div>
            )}

            {/* 평가 */}
            {t.eval && <EvalCard turn={t} dictionary={props.dictionary} onShowCard={props.onShowCard} />}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 px-1 text-sm text-mut">
            <span className="inline-block h-2 w-2 animate-ping rounded-full bg-pri" />
            선생님이 확인하는 중…
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-coral-soft px-4 py-3 text-sm text-coral">
            연결에 문제가 있어요: {error}
            <div className="mt-2 flex gap-2">
              <button onClick={() => (turns.length === 0 ? start() : submit())} className="rounded-xl bg-coral px-3 py-1.5 text-xs font-bold text-white">
                다시 시도
              </button>
              <button onClick={onSkip} className="rounded-xl bg-card px-3 py-1.5 text-xs font-bold text-sub shadow-soft">
                오늘은 건너뛰기
              </button>
            </div>
          </div>
        )}

        {finished && (
          <div className="animate-[popIn_0.25s_ease-out] rounded-3xl bg-card p-6 text-center shadow-pop">
            <div className="text-3xl">🎉</div>
            <div className="mt-2 text-lg font-extrabold text-ink">작문 스피킹 완료!</div>
            <p className="mt-1 text-sm text-sub">양쪽 대사 {SPEAK_STEPS}문장을 모두 만들었어요.</p>
            <button
              onClick={onDone}
              className="mt-4 w-full rounded-2xl bg-coral py-3.5 font-bold text-white shadow-soft transition hover:brightness-105 active:scale-95"
            >
              완료하고 돌아가기
            </button>
          </div>
        )}
      </div>

      {/* 입력 바 */}
      {!finished && current && (
        <div className="sticky bottom-0 -mx-5 bg-base/95 px-5 pb-[calc(1rem_+_env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          {/* 지금 무엇을 쓰라고 했는지 — 키보드가 올라와도 계속 보이게 입력창에 붙여 둔다 */}
          <div className="mb-2 max-h-24 overflow-y-auto rounded-2xl bg-pri-soft px-3.5 py-2.5">
            <div className="text-[11px] font-bold text-pri">
              {current.role === "me" ? "🙋 내 차례" : "🎭 상대방 차례 (내가 작문)"}
            </div>
            <div className="mt-0.5 text-[13px] leading-relaxed text-pri-deep">{current.instruction}</div>
          </div>
          <div className="flex items-end gap-2 rounded-3xl bg-card p-2 shadow-pop">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={2}
              onFocus={() =>
                // 키보드가 올라오면서 스레드가 가려지지 않게 맨 아래로 붙인다
                setTimeout(
                  () => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }),
                  250
                )
              }
              placeholder="일본어를 한글 발음으로 써보세요 (예: 스미마셍, 코레 쿠다사이)"
              className="max-h-28 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] text-ink outline-none placeholder:text-mut"
            />
            <button
              onClick={() => void submit()}
              disabled={!input.trim() || loading}
              aria-label="보내기"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-pri text-lg text-white transition hover:bg-pri-deep active:scale-95 disabled:opacity-40"
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 평가 카드: 판정 + 모범 답안(단어 탭 → 카드) + 피드백(마크다운 라이트) */
function EvalCard({
  turn,
  dictionary,
  onShowCard,
}: {
  turn: SpeakTurn;
  dictionary: Word[];
  onShowCard: (word: Word, x: number, y: number) => void;
}) {
  const ev = turn.eval!;
  const badge =
    ev.verdict === "great"
      ? { label: "훌륭해요!", cls: "bg-mint-soft text-mint" }
      : ev.verdict === "ok"
        ? { label: "뜻은 통했어요", cls: "bg-gold-soft text-gold" }
        : { label: "다시 볼까요?", cls: "bg-coral-soft text-coral" };

  return (
    <div className="rounded-3xl bg-card p-5 shadow-soft">
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.cls}`}>{badge.label}</span>

      <div className="mt-3 rounded-2xl bg-base p-3.5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-mut">모범 답안</div>
        <div className="mt-1 text-lg font-bold leading-relaxed text-ink">
          <JpText text={ev.correctJp} dictionary={dictionary} onShowCard={onShowCard} />
        </div>
        <div className="mt-0.5 text-sm text-pri-deep">{ev.correctKana}</div>
        {ev.correctKo && <div className="mt-0.5 text-xs text-mut">🔈 {ev.correctKo}</div>}
      </div>

      <div className="mt-3 text-sm leading-relaxed text-ink">
        <MdLite text={ev.feedback} />
      </div>
      <div className="mt-2 text-[11px] text-mut">일본어 단어를 탭하면 단어 카드가 떠요</div>
    </div>
  );
}

/** 아주 가벼운 마크다운 렌더러: **굵게**, "- " 목록, 줄바꿈만 처리 */
function MdLite({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const isBullet = /^\s*[-·]\s+/.test(line);
        const content = line.replace(/^\s*[-·]\s+/, "");
        const chunks = content.split(/\*\*(.+?)\*\*/g);
        const rendered = chunks.map((c, j) => (j % 2 === 1 ? <b key={j} className="text-pri-deep">{c}</b> : <span key={j}>{c}</span>));
        if (!content.trim()) return <div key={i} className="h-1" />;
        return isBullet ? (
          <div key={i} className="flex gap-1.5 pl-1">
            <span className="text-mut">•</span>
            <span className="flex-1">{rendered}</span>
          </div>
        ) : (
          <div key={i}>{rendered}</div>
        );
      })}
    </div>
  );
}
