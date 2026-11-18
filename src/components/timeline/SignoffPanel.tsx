"use client";

import { useTransition } from "react";
import { recordSignoffAction, revokeSignoffAction } from "@/app/admin/signoff-actions";
import { WHO } from "@/lib/feedback/parse";
import type { Signoff } from "@/lib/review/service";
import { useToast } from "../ui/toast";
import type { Item, Mode } from "./shared";

const WIB = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

/** Persetujuan on a milestone: active and revoked sign-offs; supervisors can record on someone's behalf and revoke with a reason. */
export function SignoffPanel({ item, signoffs, mode, slug }: { item: Item; signoffs: Signoff[]; mode: Mode; slug: string }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const mine = signoffs.filter((s) => s.itemId === item.id);
  const report = (r: { ok: boolean; error?: string }, done: string) => toast(r.ok ? { message: done } : { message: r.error ?? "Gagal.", tone: "error" });
  const who = (s: Signoff) => s.signerRole || s.signerName;
  return (
    <section className="space-y-2 hairline pt-4 text-sm">
      <h3>Persetujuan</h3>
      {mine.length === 0 && <p className="muted">Belum ada persetujuan.</p>}
      <ul className="rows">
        {mine.map((s) => (
          <li key={s.id} className={`space-y-0.5 py-2 ${s.revokedAt ? "text-muted" : ""}`}>
            <div className={s.revokedAt ? "line-through" : "font-medium"}>
              Disetujui oleh {who(s)} · {WIB.format(new Date(s.createdAt))} · {s.recordedBy ? `dicatat ${s.recordedByName ?? "tim"}` : "melalui link"}
            </div>
            {s.note && <div className="whitespace-pre-wrap">{s.note}</div>}
            {s.evidenceUrl && <a className="block truncate underline underline-offset-2" href={s.evidenceUrl} target="_blank" rel="noreferrer noopener">{s.evidenceUrl}</a>}
            {s.revokedAt && <div>Dicabut {WIB.format(new Date(s.revokedAt))}: {s.revokeReason}</div>}
            {mode === "edit" && !s.revokedAt && (
              <form
                className="flex items-end gap-2 pt-1"
                action={(f) => start(async () => report(await revokeSignoffAction(slug, s.id, String(f.get("reason") ?? "")), "Persetujuan dicabut."))}
              >
                <label className="min-w-0 flex-1"><span>Alasan mencabut</span><input name="reason" required maxLength={500} /></label>
                <button className="btn-danger" disabled={busy}>Cabut</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {mode === "edit" && (
        <form
          key={mine.length}
          className="space-y-2"
          action={(f) => start(async () => report(await recordSignoffAction(slug, item.id, {
            signerName: String(f.get("signerName") ?? ""), signerRole: String(f.get("signerRole") ?? ""), note: String(f.get("note") ?? ""), evidenceUrl: String(f.get("evidenceUrl") ?? ""),
          }), "Persetujuan dicatat."))}
        >
          <h4 className="font-semibold">Catat persetujuan</h4>
          <div className="grid grid-cols-2 gap-2">
            <label><span>Nama</span><input name="signerName" required maxLength={60} autoComplete="off" /></label>
            <label><span>Peran</span><input name="signerRole" list="signoff-who" maxLength={60} autoComplete="off" /></label>
            <datalist id="signoff-who">{WHO.map((w) => <option key={w} value={w} />)}</datalist>
          </div>
          <label><span>Catatan</span><input name="note" maxLength={500} /></label>
          <label><span>Link bukti (opsional)</span><input name="evidenceUrl" type="url" inputMode="url" placeholder="https://" /></label>
          <button className="btn" disabled={busy}>Catat</button>
        </form>
      )}
    </section>
  );
}
