"use client";

import { useEffect, useState } from "react";
import { deleteVersionAction, restoreVersionAction, saveVersionAction } from "@/app/admin/schedule-actions";
import type { VersionRow } from "@/lib/schedule/service";
import { ConfirmButton } from "../ui/controls";

export const stamp = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Save the current timeline under a name, and restore or delete saved ones. One component, opened from the toolbar and from "Kelola". */
export function VersionsPanel({ slug, versions }: { slug: string; versions: VersionRow[] }) {
  const [name, setName] = useState("");
  // The suggestion holds the current time, so it is filled in after mount to keep server and client markup equal.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setName(`Versi ${stamp.format(new Date())}`), [versions.length]);
  return (
    <section className="space-y-3">
      <p className="muted text-sm">Simpan keadaan timeline sekarang supaya bisa dibandingkan atau dipulihkan nanti. Memulihkan sebuah versi otomatis menyimpan keadaan saat ini lebih dulu.</p>
      <form action={saveVersionAction} className="flex items-end gap-2">
        <input type="hidden" name="slug" value={slug} />
        <label className="min-w-0 flex-1"><span>Nama versi</span><input name="name" required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button className="btn-secondary">Simpan versi</button>
      </form>
      {versions.length === 0 ? <p className="muted text-sm">Belum ada versi tersimpan.</p> : (
        <ul className="rows text-sm">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{v.name}</span>
                <span className="muted block text-xs tabular-nums">{stamp.format(new Date(v.createdAt))}{v.by ? ` · ${v.by}` : ""} · {v.items} item</span>
              </span>
              <form action={restoreVersionAction}>
                <input type="hidden" name="slug" value={slug} /><input type="hidden" name="versionId" value={v.id} />
                <ConfirmButton className="btn-ghost" message={`Pulihkan timeline ke versi "${v.name}"? Keadaan sekarang disimpan dulu sebagai versi.`}>Pulihkan</ConfirmButton>
              </form>
              <form action={deleteVersionAction}>
                <input type="hidden" name="slug" value={slug} /><input type="hidden" name="versionId" value={v.id} />
                <ConfirmButton message={`Hapus versi "${v.name}"?`}>Hapus</ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
