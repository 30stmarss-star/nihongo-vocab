import { useEffect, useState } from "react";
import { deleteCard, loadSavedCards, type SavedCard, type SavedDetail, type SavedKind } from "../lib/mangaSaved";

const kinds: ("전체" | SavedKind)[] = ["전체", "문장", "단어", "문법", "한자"];

function StudyDetails({ title, items }: { title: string; items?: SavedDetail[] }) {
  if (!items?.length) return null;
  return <details className="mt-3 border-t border-line pt-2 text-sm">
    <summary className="cursor-pointer font-bold text-ink">{title} {items.length}</summary>
    <div className="mt-2 space-y-2">
      {items.map((item, index) => <div key={`${item.text}-${index}`} className="rounded-xl bg-page px-3 py-2">
        <div className="font-bold text-ink">{item.text} <span className="font-normal text-xs text-mut">{item.reading}</span></div>
        {item.translation && <div className="text-pri-deep">{item.translation}</div>}
        {(item.level || item.surface || item.parts) && <div className="text-xs text-sub">
          {[item.level && `${item.level} 추정`, item.surface && `본문 ${item.surface}`, item.parts].filter(Boolean).join(" · ")}
        </div>}
        {(item.on || item.kun || item.radical || item.hint) && <div className="text-xs text-sub">
          {[item.on && `음 ${item.on}`, item.kun && `훈 ${item.kun}`, item.radical && `부수 ${item.radical}`, item.hint].filter(Boolean).join(" · ")}
        </div>}
      </div>)}
    </div>
  </details>;
}

export function MangaSaved({ userId }: { userId: string | null }) {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [filter, setFilter] = useState<"전체" | SavedKind>("전체");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void loadSavedCards(userId).then(rows => { if (live) setCards(rows); })
      .catch(e => { if (live) setError(e.message || "저장고를 불러오지 못했습니다."); });
    return () => { live = false; };
  }, [userId]);

  const remove = async (id: string) => {
    if (!userId || busy) return;
    setBusy(id); setError("");
    try { await deleteCard(userId, id); setCards(rows => rows.filter(row => row.id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : "삭제하지 못했습니다."); }
    finally { setBusy(null); }
  };

  const shown = cards.filter(card => filter === "전체" || card.kind === filter);
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-1.5">
      {kinds.map(kind => <button key={kind} onClick={() => setFilter(kind)}
        className={`rounded-xl px-3 py-1.5 text-xs font-bold ${filter === kind ? "bg-pri text-white" : "bg-card text-sub"}`}>
        {kind}
      </button>)}
    </div>
    {error && <p role="alert" className="rounded-xl bg-gold-soft px-3 py-2 text-sm text-gold">{error}</p>}
    {!shown.length && <p className="rounded-2xl bg-card px-4 py-10 text-center text-sm text-mut shadow-soft">
      {cards.length ? "이 종류의 저장 항목이 없어요." : "아직 저장한 항목이 없어요. 판독한 대사의 저장 버튼이나 PC 확장의 +를 눌러보세요."}
    </p>}
    {shown.map(card => {
      const href = (() => { try { const url = new URL(card.source?.url || ""); return url.protocol === "https:" && url.hostname === "shonenjumpplus.com" ? url.href : null; } catch { return null; } })();
      return <article key={card.id} className="rounded-2xl bg-card p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-mut">{card.kind} · {[card.source?.title, card.source?.episode].filter(Boolean).join(" · ")}</div>
            <div className="mt-1 break-words text-lg font-bold leading-relaxed text-ink">{card.text}</div>
            {card.reading && <div className="text-xs text-mut">{card.reading}</div>}
            {card.translation && <div className="mt-1 text-sm font-semibold text-pri-deep">{card.translation}</div>}
          </div>
          <button type="button" disabled={busy === card.id} onClick={() => void remove(card.id)}
            aria-label={`${card.text} 삭제`} className="shrink-0 rounded-lg bg-page px-2 py-1 text-xs text-sub disabled:opacity-50">삭제</button>
        </div>
        <StudyDetails title="어휘" items={card.vocabulary} />
        <StudyDetails title="문법" items={card.grammar} />
        <StudyDetails title="한자" items={card.kanji} />
        {href && <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-bold text-pri-deep">점프플러스 원문 열기 ↗</a>}
      </article>;
    })}
  </div>;
}
