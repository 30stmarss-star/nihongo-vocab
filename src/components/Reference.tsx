import { useState } from "react";
import { REFERENCE, type RefTable } from "../data/reference";

/** 특수 암기(참고) — 표로 외우는 게 나은 불규칙·음편·활용 모음. 아코디언으로 펼쳐 봄. */
export function Reference() {
  const [open, setOpen] = useState<string | null>(REFERENCE[0]?.id ?? null);

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-neutral-500">
        플래시카드보다 표로 외우는 게 나은 것들이에요. 주황색은 특히 불규칙해서 통째로
        외워야 하는 부분.
      </p>
      {REFERENCE.map((t) => {
        const isOpen = open === t.id;
        return (
          <div
            key={t.id}
            className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/60"
          >
            <button
              onClick={() => setOpen(isOpen ? null : t.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
            >
              <span className="text-lg">{t.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">{t.title}</span>
                {t.sub && (
                  <span className="block truncate text-xs text-neutral-500">{t.sub}</span>
                )}
              </span>
              <span
                className={[
                  "text-neutral-500 transition-transform",
                  isOpen ? "rotate-90" : "",
                ].join(" ")}
              >
                ›
              </span>
            </button>

            {isOpen && (
              <div className="space-y-4 border-t border-white/10 px-4 pb-4 pt-3">
                {t.tips && t.tips.length > 0 && (
                  <ul className="space-y-1 rounded-xl bg-amber-400/[0.07] px-3 py-2 text-xs text-amber-200/90">
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
        <div className="mb-1.5 text-xs font-medium text-neutral-400">{table.caption}</div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
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
                  "border-b border-white/5 last:border-0",
                  hi.has(ri) ? "text-amber-300" : "text-neutral-200",
                ].join(" ")}
              >
                {r.map((cell, ci) => (
                  <td
                    key={ci}
                    className={[
                      "py-1.5 pr-3 align-top [overflow-wrap:anywhere]",
                      ci === 0 ? "text-neutral-400" : "",
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
