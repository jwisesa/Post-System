"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { changeVersionStatus } from "@/app/admin/budget-actions";
import { Drawer } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { NEXT, VERSION_STATUSES, type VersionStatusCode } from "@/lib/budget/catalog";

/** Offers only the moves allowed by NEXT. Undoing an approval ("batal setujui") needs a note, asked in a drawer. */
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
  return (
    <>
      <select aria-label="Ubah status" className="ms-2 min-w-[9.5rem]" value="" onChange={(e) => { const v = e.target.value; if (!v) return; if (status === "approved") setUndo(v); else if (v === "approved" && !window.confirm(`Setujui v${number}? ${vendor} akan dipilih untuk lingkup ini.`)) return; else change(v); }}>
        <option value="">Ubah</option>
        {options.map((o) => <option key={o} value={o}>{status === "approved" ? "Batal setujui" : VERSION_STATUSES[o]}</option>)}
      </select>
      {undo && (
        <Drawer title="Batal setujui" crumb="Anggaran & vendor" dirty={!!note.trim()} onClose={() => { setUndo(null); setNote(""); }}>
          <form className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault(); if (note.trim()) change(undo, note); }}>
            <p className="muted">Vendor tetap terpilih, tetapi nilainya kembali menjadi perkiraan sampai ada versi yang disetujui. Alasan dicatat di riwayat.</p>
            <label className="grid gap-1">Alasan (wajib)<textarea rows={3} required maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <button className="btn" disabled={busy || !note.trim()}>{busy ? "Menyimpan…" : "Batal setujui"}</button>
          </form>
        </Drawer>
      )}
    </>
  );
}
