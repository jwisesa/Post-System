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
  return (
    <li className="space-y-2 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0"><span className="font-medium">{row.name}</span> <span className="muted">· {row.track}</span></span>
        <span className="muted">{fmtDate(row.dueDate)}{row.late && <span className="tag tag-danger ml-1.5">Terlambat</span>} · {row.daysSinceUpdate} hari tanpa update</span>
      </div>
      <div className="muted flex flex-wrap gap-x-3">
        <span>PIC: {row.picName ?? "belum ditentukan"}</span>
        {row.picEmail && <a className="text-accent" href={`mailto:${row.picEmail}`}>{row.picEmail}</a>}
        {row.picPhone && <a className="text-accent" href={`tel:${row.picPhone}`}>{row.picPhone}</a>}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); act(() => markFollowedUp(slug, row.id, note), "Follow-up dicatat."); }}
      >
        <input className="min-w-0 flex-1" aria-label={`Catatan follow-up ${row.name}`} placeholder="Catatan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-secondary" disabled={busy}>Sudah di-follow-up</button>
      </form>
    </li>
  );
}

export function FollowUpList({ rows, slug }: { rows: Row[]; slug: string }) {
  if (rows.length === 0) return <p className="muted text-sm">Tidak ada item yang perlu di-follow-up.</p>;
  return <ul className="divide-y divide-line">{rows.map((r) => <FollowUpRow key={r.id} row={r} slug={slug} />)}</ul>;
}
