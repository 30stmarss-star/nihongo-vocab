import { useState } from "react";
import { REFERENCE, type RefTable } from "../data/reference";

/** 특수 암기(참고) — 표로 외우는 게 나은 불규칙·음편·활용 모음. 아코디언으로 펼쳐 봄. */
export function Reference() {
  const [open, setOpen] = useState<string | null>(REFERENCE[0]?.id ?? null);

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-mut">
        플래시카드보다 표로 외우는 게 나은 것들이에요. 주황색은 특히 불규칙해서 통째로
        외워야 하는 부분.
      </p>
      {REFERENCE.map((t) => {
        const isOpen = open === t.id;
        return (
          <div
            key={t.id}
            className="overflow-hidden rounded-2xl bg-card shadow-soft"
          >
            <button
              onClick={() => setOpen(isOpen ? null : t.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-pri-soft/40"
            >
              <span className="text-lg">{t.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{t.title}</span>
                {t.sub && (
                  <span className="block truncate text-xs text-mut">{t.sub}</span>
                )}
              </span>
              <span
                className={[
                  "text-mut transition-transform",
                  isOpen ? "rotate-90" : "",
                ].join(" ")}
              >
                ›
              </span>
            </button>

            {isOpen && (
              <div className="space-y-4 border-t border-line px-4 pb-4 pt-3">
                {t.tips && t.tips.length > 0 && (
                  <ul className="space-y-1 rounded-xl bg-gold/[0.07] px-3 py-2 text-xs text-gold/90">
                    {t.tips.map((tip, i) => (
                      <li key={i}>· {tip}</li>
                    ))}
                  </ul>
                )}
                {t.tables.map((tb, i) => (
                  <TableView key={i} table={tb} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TableView({ table }: { table: RefTable }) {
  const hi = new Set(table.hiRows ?? []);
  return (
    <div>
      {table.caption && (
        <div className="mb-1.5 text-xs font-medium text-sub">{table.caption}</div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-mut">
              {table.cols.map((c, i) => (
                <th key={i} className="py-1.5 pr-3 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, ri) => (
              <tr
                key={ri}
                className={[
                  "border-b border-line last:border-0",
                  hi.has(ri) ? "text-gold" : "text-ink",
                ].join(" ")}
              >
                {r.map((cell, ci) => (
                  <td
                    key={ci}
                    className={[
                      "py-1.5 pr-3 align-top [overflow-wrap:anywhere]",
                      ci === 0 ? "text-sub" : "",
                      hi.has(ri) && ci !== 0 ? "font-semibold" : "",
                    ].join(" ")}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
