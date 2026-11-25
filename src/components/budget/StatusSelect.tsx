"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { changeVersionStatus } from "@/app/admin/budget-actions";
import { Drawer } from "@/components/ui/controls";
import { Popover } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast";
import { NEXT, VERSION_STATUSES, type VersionStatusCode } from "@/lib/budget/catalog";

/** "Ubah ▾" menu offering only the moves allowed by NEXT. Undoing an approval ("batal setujui") needs a note, asked in a drawer. */
export function StatusSelect({ slug, versionId, status, number, vendor }: { slug: string; versionId: string; status: VersionStatusCode; number: number; vendor: string }) {
  const toast = useToast();
  const router = useRouter();
  const [undo, setUndo] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const options = NEXT[status];
  if (!options.length) return null;
  const change = async (to: string, why = "") => {
    setBusy(true);
    const r = await changeVersionStatus(slug, versionId, to, why);
    setBusy(false);
    if (!r.ok) { toast({ message: r.error, tone: "error" }); return; }
    toast({ message: r.picked ? `Disetujui. ${r.vendor} dipilih untuk lingkup ini.` : "Status diubah." });
    setUndo(null); setNote("");
    router.refresh();
  };
  const pick = (v: string) => { if (status === "approved") setUndo(v); else if (v === "approved" && !window.confirm(`Setujui v${number}? ${vendor} akan dipilih untuk lingkup ini.`)) return; else change(v); };
  return (
    <>
      <Popover fixed label={`Ubah status v${number}`} trigger={<>Ubah <span aria-hidden>▾</span></>}>
        {(close) => options.map((o) => <button key={o} type="button" role="menuitem" disabled={busy} onClick={() => { close(); pick(o); }}>{status === "approved" ? "Batal setujui" : VERSION_STATUSES[o]}</button>)}
      </Popover>
      {undo && (
        <Drawer title="Batal setujui" crumb="Anggaran & vendor" dirty={!!note.trim()} onClose={() => { setUndo(null); setNote(""); }}>
          <form className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault(); if (note.trim()) change(undo, note); }}>
            <p className="muted">Vendor tetap masuk budget, tetapi nilainya kembali menjadi perkiraan sampai ada versi yang disetujui. Alasan dicatat di riwayat.</p>
            <label className="grid gap-1">Alasan (wajib)<textarea rows={3} required maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <button className="btn" disabled={busy || !note.trim()}>{busy ? "Menyimpan…" : "Batal setujui"}</button>
          </form>
        </Drawer>
      )}
    </>
  );
}
