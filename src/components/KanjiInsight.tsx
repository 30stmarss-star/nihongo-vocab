import { useState } from "react";
import type { Word } from "../data/types";
import { supabase } from "../lib/supabase";

/**
 * 한자 자세히 배우기 — 누르면 Claude가 그 자리에서 한자를 분석해 준다.
 * 어원·자원(상형/회의/형성)·부수 분해·음훈 연결·관련 단어.
 * 한 번 받은 풀이는 브라우저에 캐시해 다음부터 즉시 뜨고 비용도 안 든다.
 */

interface CharInsight {
  char: string;
  korean: string;
  type: string;
  origin: string;
  parts: string;
  reading: string;
  related: string[];
}

interface Insight {
  chars: CharInsight[];
  note: string;
}

const cacheKey = (w: Word) => `kanji.insight.${w.id}`;

function loadCache(w: Word): Insight | null {
  try {
    const raw = localStorage.getItem(cacheKey(w));
    return raw ? (JSON.parse(raw) as Insight) : null;
  } catch {
    return null;
  }
}

const TYPE_HINT: Record<string, string> = {
  상형: "그림에서 온 글자",
  지사: "기호로 뜻을 나타낸 글자",
  회의: "뜻 + 뜻을 합친 글자",
  형성: "뜻 + 소리를 합친 글자",
};

export function KanjiInsight({ word }: { word: Word }) {
  const [data, setData] = useState<Insight | null>(() => loadCache(word));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchInsight() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      if (!supabase) throw new Error("클라우드 모드에서만 쓸 수 있어요.");
      const { data: res, error: err } = await supabase.functions.invoke("kanji-insight", {
        body: {
          word: {
            kanji: word.kanji,
            kana: word.kana,
            meaning: word.meaning,
            level: word.level,
          },
        },
      });
      if (err) throw err;
      if (res?.error) throw new Error(String(res.error));
      const insight: Insight = {
        chars: Array.isArray(res?.chars) ? res.chars : [],
        note: String(res?.note ?? ""),
      };
      setData(insight);
      setOpen(true);
      try {
        localStorage.setItem(cacheKey(word), JSON.stringify(insight));
      } catch {
        /* 저장 공간이 없으면 이번만 보고 넘어간다 */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (data) setOpen((o) => !o);
    else void fetchInsight();
  }

  return (
    <div className="mt-3 text-left">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // 카드 뒤집기와 분리
          toggle();
        }}
        disabled={loading}
        className="w-full rounded-2xl bg-gold-soft py-2.5 text-sm font-bold text-gold transition active:scale-[0.98] disabled:opacity-60"
      >
        {loading
          ? "한자를 뜯어보는 중…"
          : open
            ? "한자 풀이 접기 ▲"
            : "🔍 한자 자세히 배우기"}
      </button>

      {error && (
        <div className="mt-2 rounded-2xl bg-coral-soft px-4 py-3 text-sm text-coral">
          풀이를 못 가져왔어요: {error}
        </div>
      )}

      {open && data && (
        <div className="mt-3 animate-[popIn_0.2s_ease-out] space-y-3">
          {data.chars.map((c, i) => (
            <div key={i} className="rounded-2xl bg-page p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-ink">{c.char}</span>
                <span className="text-sm font-bold text-gold">{c.korean}</span>
                {c.type && (
                  <span
                    className="ml-auto rounded-full bg-card px-2.5 py-1 text-xs font-bold text-sub"
                    title={TYPE_HINT[c.type] ?? ""}
                  >
                    {c.type}
                  </span>
                )}
              </div>

              {c.type && TYPE_HINT[c.type] && (
                <div className="mt-1 text-[11px] text-mut">{TYPE_HINT[c.type]}</div>
              )}

              {c.origin && (
                <p className="mt-2.5 text-sm leading-relaxed text-ink">{c.origin}</p>
              )}

              {c.parts && (
                <div className="mt-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-mut">
                    글자 분해
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-sub">{c.parts}</p>
                </div>
              )}

              {c.reading && (
                <div className="mt-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-mut">
                    음독 · 훈독
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-sub">{c.reading}</p>
                </div>
              )}

              {Array.isArray(c.related) && c.related.length > 0 && (
                <div className="mt-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-mut">
                    이 한자가 든 단어
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {c.related.map((r, j) => (
                      <span key={j} className="rounded-lg bg-card px-2 py-1 text-xs text-sub">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {data.note && (
            <div className="rounded-2xl bg-pri-soft p-4 text-sm leading-relaxed text-pri-deep">
              💡 {data.note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
