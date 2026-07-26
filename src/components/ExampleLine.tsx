import { useState } from "react";
import type { Example, Word } from "../data/types";
import { supabase } from "../lib/supabase";
import { JpText, type Token } from "./JpText";

/**
 * 예문 한 줄. 기본은 규칙 기반 하이라이트로 즉시 보여주고,
 * '문장 분해'를 누르면 Claude가 이 문장을 통째로 형태소 분해해
 * 활용형·조사까지 전부 잡아준다. 결과는 문장 단위로 캐시한다.
 */

const cacheKey = (jp: string) => `sentence.tokens.${jp}`;

function loadCache(jp: string): Token[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(jp));
    return raw ? (JSON.parse(raw) as Token[]) : null;
  } catch {
    return null;
  }
}

/** 분해 결과가 원문과 어긋나면(글자 누락·추가) 쓰지 않는다 */
function tokensMatch(tokens: Token[], jp: string): boolean {
  return tokens.map((t) => t.surface ?? "").join("") === jp;
}

export function ExampleLine({
  ex,
  dictionary,
  onShowCard,
}: {
  ex: Example;
  dictionary: Word[];
  onShowCard: (word: Word, x: number, y: number) => void;
}) {
  const [tokens, setTokens] = useState<Token[] | null>(() => loadCache(ex.jp));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze(e: React.MouseEvent) {
    e.stopPropagation();
    if (loading || tokens) return;
    setLoading(true);
    setError("");
    try {
      if (!supabase) throw new Error("클라우드 모드에서만 쓸 수 있어요.");
      const { data, error: err } = await supabase.functions.invoke("analyze-sentence", {
        body: { sentence: ex.jp, ko: ex.ko },
      });
      if (err) throw err;
      if (data?.error) throw new Error(String(data.error));
      const list: Token[] = Array.isArray(data?.tokens) ? data.tokens : [];
      if (!list.length) throw new Error("분해 결과가 비어 있어요.");
      if (!tokensMatch(list, ex.jp)) throw new Error("분해 결과가 원문과 달라요.");
      setTokens(list);
      try {
        localStorage.setItem(cacheKey(ex.jp), JSON.stringify(list));
      } catch {
        /* 저장 공간이 없으면 이번만 보고 넘어간다 */
      }
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl bg-base p-3 text-left">
      <div className="text-sm font-medium leading-relaxed text-ink">
        <JpText text={ex.jp} dictionary={dictionary} tokens={tokens} onShowCard={onShowCard} />
      </div>
      {ex.kana && ex.kana !== ex.jp && <div className="mt-0.5 text-xs text-mut">{ex.kana}</div>}
      {ex.ko && <div className="mt-0.5 text-xs text-sub">{ex.ko}</div>}

      {!tokens && (
        <button
          type="button"
          onClick={analyze}
          disabled={loading}
          className="mt-2 text-[11px] font-bold text-pri-deep transition disabled:text-mut"
        >
          {loading ? "문장 분해 중…" : "🔬 문장 통째로 분해하기"}
        </button>
      )}
      {tokens && <div className="mt-2 text-[11px] text-mint">✓ 분해됨 — 조사까지 전부 탭할 수 있어요</div>}
      {error && <div className="mt-2 text-[11px] text-coral">{error}</div>}
    </div>
  );
}
