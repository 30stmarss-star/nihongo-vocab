import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { supabase } from "../lib/supabase";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const GREETING = `안녕하세요! 일본어 회화 튜터예요. 두 가지로 연습할 수 있어요:

- **한국어로** 쓰면 → 자연스러운 일본어로 답하고 단어·문법을 해설해 드려요.
- **일본어를 한글 발음으로** 쓰면 (예: "오하요우 고자이마스") → 정식 표기로 바꿔주고 더 자연스러운 표현을 알려드려요.

무엇이든 편하게 입력해 보세요.`;

/** 아주 가벼운 마크다운 렌더러 (굵게 / 목록 / 「일본어」 강조). 외부 의존성 없음. */
function renderInline(text: string, keyBase: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|「[^」]+」)/g);
  return parts.map((p, i) => {
    const key = `${keyBase}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(p))
      return (
        <strong key={key} className="font-semibold text-ink">
          {p.slice(2, -2)}
        </strong>
      );
    if (/^「[^」]+」$/.test(p))
      return (
        <span key={key} className="font-semibold text-pri-deep">
          {p}
        </span>
      );
    return <span key={key}>{p}</span>;
  });
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1 leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />;
        const bullet = /^\s*[-・*]\s+/.test(line);
        if (bullet) {
          const content = line.replace(/^\s*[-・*]\s+/, "");
          return (
            <div key={i} className="flex gap-2 pl-0.5">
              <span className="select-none text-mint">·</span>
              <span>{renderInline(content, String(i))}</span>
            </div>
          );
        }
        return <div key={i}>{renderInline(line, String(i))}</div>;
      })}
    </div>
  );
}

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy || !supabase) return;
    setErr(null);
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("tutor-chat", {
        body: { messages: next },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const reply = String(data?.reply ?? "").trim();
      setMessages((m) => [...m, { role: "assistant", content: reply || "(빈 응답)" }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl bg-card shadow-soft">
      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4 text-sm sm:px-4">
        {messages.length === 0 && (
          <div className="rounded-2xl bg-card/70 px-4 py-3 text-sub">
            <Markdown text={GREETING} />
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-pri-soft px-3.5 py-2 text-pri-deep">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-card px-3.5 py-2.5 text-ink">
                <Markdown text={m.content} />
              </div>
            </div>
          ),
        )}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-card px-4 py-3 text-mut">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mut [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mut [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-mut" />
              </span>
            </div>
          </div>
        )}

        {err && (
          <div className="rounded-xl border border-gold/30 bg-gold-soft px-3 py-2 text-xs text-gold">
            {err}
          </div>
        )}
      </div>

      {/* 입력 바 */}
      <div className="border-t border-line bg-card p-2.5">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder="한국어 또는 일본어 발음으로 입력… (Enter 전송, Shift+Enter 줄바꿈)"
            className="max-h-32 flex-1 resize-none rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink outline-none focus:border-pri"
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            className="shrink-0 rounded-xl bg-pri px-4 py-2 text-sm font-medium text-white transition hover:bg-pri-deep disabled:opacity-40"
          >
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
