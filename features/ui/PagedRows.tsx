"use client";

import { Children, useState } from "react";

// D-258 (owner: "pagination wherever a table is used"): a table body that
// shows its rows a page at a time, with the pager in the table's footer.
// The rows are rendered on the server as usual and passed in as children.
export function PagedRows({ children, colSpan, pageSize = 25, label = "rows" }: { children: React.ReactNode; colSpan: number; pageSize?: number; label?: string }) {
  const rows = Children.toArray(children);
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  return (
    <>
      <tbody>{rows.slice((current - 1) * pageSize, current * pageSize)}</tbody>
      {pages > 1 && (
        <tfoot>
          <tr>
            <td colSpan={colSpan} className="border-t border-line px-4 py-2">
              <nav aria-label={`Pages of ${label}`} className="flex flex-wrap items-center justify-between gap-2 text-label">
                <span className="text-ink-muted">
                  {((current - 1) * pageSize + 1).toLocaleString("en-IN")}–{Math.min(current * pageSize, rows.length).toLocaleString("en-IN")} of {rows.length.toLocaleString("en-IN")} {label}
                </span>
                <span className="flex items-center gap-1">
                  <button type="button" className="btn-ghost btn-compact" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Previous page">
                    ←
                  </button>
                  <span className="px-2 tabular-nums">
                    {current} / {pages}
                  </span>
                  <button type="button" className="btn-ghost btn-compact" disabled={current === pages} onClick={() => setPage(current + 1)} aria-label="Next page">
                    →
                  </button>
                </span>
              </nav>
            </td>
          </tr>
        </tfoot>
      )}
    </>
  );
}
