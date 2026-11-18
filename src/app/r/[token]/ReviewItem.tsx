"use client";

import { useState, useTransition } from "react";
import { ConfirmButton } from "@/components/ui/controls";
import { reviewerAddFeedback, reviewerSignoff } from "../actions";

type Point = { id: string; ref: string; body: string; status: string; checkNote: string };
type Props = {
  token: string; id: string; name: string; date: string; phaseName: string; trackName: string; statusLabel: string;
  points: Point[]; signedAt: string | null;
};

const STATE: Record<string, string> = { open: "Belum dicek", fixed: "Sudah", dropped: "Tidak dikerjakan" };
const WIB = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export function ReviewItem({ token, id, name, date, phaseName, trackName, statusLabel, points, signedAt }: Props) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      try { await fn(); setMsg(""); after?.(); } catch { setMsg("Gagal. Link mungkin sudah dicabut, atau milestone ini sudah disetujui."); }
    });
  return (
    <section className="card space-y-3">
      <div>
        <h2>{name}</h2>
        <p className="muted text-sm">{date} · {phaseName} · {trackName} · {statusLabel}</p>
      </div>
      <div>
        <h3>Poin Anda</h3>
        {points.length === 0 ? <p className="muted text-sm">Belum ada.</p> : (
          <ul className="rows text-sm">
            {points.map((p) => (
              <li key={p.id} className="flex items-baseline gap-2 py-1.5">
                {p.ref && <span className="shrink-0 text-xs font-semibold tabular-nums">{p.ref}</span>}
                <span className="min-w-0 flex-1 whitespace-pre-wrap">{p.body}</span>
                <span className="muted shrink-0 text-xs">{STATE[p.status] ?? p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <label>
        <span>Satu poin per baris</span>
        <textarea rows={4} value={text} maxLength={10000} placeholder={"00:14:32 Potong adegan 3\nGanti musik temp"} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={busy || !text.trim()} onClick={() => run(() => reviewerAddFeedback(token, id, text), () => setText(""))}>Kirim feedback</button>
        {signedAt ? (
          <span className="text-sm font-semibold text-ok">Disetujui {WIB.format(new Date(signedAt))}</span>
        ) : (
          <ConfirmButton type="button" className="btn-secondary" disabled={busy} message={`Setujui ${name}?`} onClick={() => run(() => reviewerSignoff(token, id, ""))}>Setujui {name}</ConfirmButton>
        )}
      </div>
      {msg && <p role="alert" className="text-sm text-danger">{msg}</p>}
    </section>
  );
}
