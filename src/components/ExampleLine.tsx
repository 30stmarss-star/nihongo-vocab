import { useState } from "react";
import type { Example, Word } from "../data/types";
import { analyzeSentence, loadTokens } from "../lib/sentences";
import { JpText, type Token } from "./JpText";

/**
 * 예문 한 줄. 코스 시작 때 미리 분해해 둔 결과가 있으면 그걸 바로 쓰고,
 * 없으면 규칙 기반 하이라이트로 보여준 뒤 '문장 분해'로 요청할 수 있다.
 */

export function ExampleLine({
  ex,
  dictionary,
  onShowCard,
}: {
  ex: Example;
  dictionary: Word[];
  onShowCard: (word: Word, x: number, y: number) => void;
}) {
  const [tokens, setTokens] = useState<Token[] | null>(() => loadTokens(ex.jp));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze(e: React.MouseEvent) {
    e.stopPropagation();
    if (loading || tokens) return;
    setLoading(true);
    setError("");
    try {
      setTokens(await analyzeSentence(ex.jp, ex.ko));
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl bg-page p-3 text-left">
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
