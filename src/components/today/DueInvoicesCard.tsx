import Link from "next/link";
import { fmtDate } from "@/lib/schedule/dates";
import { ListHead } from "./TodayCards";

export type DueInvoice = { id: string; scopeId: string; scope: string; vendor: string; termin: string; dueDate: string; late: boolean };

/** Admin-only Hari Ini card. Shows no amounts; renders nothing when no invoice is due. */
export function DueInvoicesCard({ rows, slug }: { rows: DueInvoice[]; slug: string }) {
  if (!rows.length) return null;
  return (
    <section>
      <ListHead title="Tagihan jatuh tempo" count={rows.length} href={`/admin/p/${slug}/budget?tab=bills`} link="Semua tagihan" />
      <ul>
        {rows.map((r) => (
          <li key={r.id} className="due-row" data-late={r.late ? "" : undefined}>
            <span className={`due-date ${r.late ? "text-danger" : ""}`}>{fmtDate(r.dueDate).replace(/ \d{4}$/, "")}</span>
            <span className="due-name">{r.vendor} <span className="due-ctx">· {r.termin || "tagihan"} · {r.scope}{r.late ? " · lewat tempo" : ""}</span></span>
            <Link href={`/admin/p/${slug}/budget/scope/${r.scopeId}`} className="btn-secondary !min-h-7">Buka</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
