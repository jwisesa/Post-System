"use client";

import { useState } from "react";
import { markFollowedUp } from "@/app/admin/today-actions";
import { fmtDate } from "@/lib/schedule/dates";
import type { TodayData } from "@/lib/today/service";
import { useAct } from "../assets/AttachmentList";

type Row = TodayData["followUp"][number];

function FollowUpRow({ row, slug }: { row: Row; slug: string }) {
  const { act, busy } = useAct();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <li>
      <div className="due-row" data-late={row.late || undefined}>
        <span className="due-date">{fmtDate(row.dueDate).replace(/ \d{4}$/, "")}</span>
        <span className="due-name">
          {row.name}{" "}
          <span className="due-ctx">· {row.track} · {row.daysSinceUpdate} hari tanpa update · {row.picName ?? "PIC belum ditentukan"}</span>
        </span>
        <button type="button" className="btn-ghost !min-h-6" aria-expanded={open} onClick={() => setOpen(!open)}>Catat</button>
      </div>
      {open && (
        <div className="space-y-2 pb-3 ps-[4.25rem] text-[13px]">
          {(row.picEmail || row.picPhone) && (
            <div className="flex flex-wrap gap-x-3 text-ink-2">
              {row.picEmail && <a className="underline underline-offset-2" href={`mailto:${row.picEmail}`}>{row.picEmail}</a>}
              {row.picPhone && <a className="underline underline-offset-2" href={`tel:${row.picPhone}`}>{row.picPhone}</a>}
            </div>
          )}
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); act(() => markFollowedUp(slug, row.id, note), "Follow-up dicatat."); }}
          >
            <input className="min-w-0 flex-1" aria-label={`Catatan follow-up ${row.name}`} placeholder="Catatan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-secondary" disabled={busy}>Sudah di-follow-up</button>
          </form>
        </div>
      )}
    </li>
  );
}

export function FollowUpList({ rows, slug }: { rows: Row[]; slug: string }) {
  if (rows.length === 0) return <p className="py-2 text-[13px] text-ink-2">Tidak ada item yang perlu di-follow-up.</p>;
  return <ul>{rows.map((r) => <FollowUpRow key={r.id} row={r} slug={slug} />)}</ul>;
}
