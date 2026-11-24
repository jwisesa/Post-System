"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { archiveVendor, removeVendor, saveVendor } from "@/app/admin/budget-actions";
import { ConfirmButton, Drawer } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { categoryLabel, SERVICE_CATEGORIES } from "@/lib/budget/catalog";

export type VendorRow = { id: string; name: string; categories: string[]; contactName: string; email: string; phone: string; teamContactId: string | null; chargesPpn: boolean; withholdsPph23: boolean; notes: string; archived: boolean };
type Opt = { id: string; name: string };

function VendorDrawer({ slug, v, contacts, onClose }: { slug: string; v: VendorRow | null; contacts: Opt[]; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [f, setF] = useState({ name: v?.name ?? "", categories: v?.categories ?? [], contactName: v?.contactName ?? "", email: v?.email ?? "", phone: v?.phone ?? "", teamContactId: v?.teamContactId ?? "", chargesPpn: v?.chargesPpn ?? true, withholdsPph23: v?.withholdsPph23 ?? true, notes: v?.notes ?? "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await saveVendor(slug, v?.id ?? null, { ...f, teamContactId: f.teamContactId || null });
    setBusy(false);
    if (!r.ok) { toast({ message: r.error, tone: "error" }); return; }
    toast({ message: "Vendor disimpan." });
    onClose();
    router.refresh();
  };
  return (
    <Drawer title={v ? "Ubah vendor" : "Tambah vendor"} crumb="Anggaran & vendor" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 text-sm">
        <label className="grid gap-1">Nama vendor<input value={f.name} maxLength={120} required onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <fieldset className="grid gap-1"><legend className="mb-1">Kategori</legend>
          {Object.entries(SERVICE_CATEGORIES).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={f.categories.includes(k)} onChange={() => setF({ ...f, categories: f.categories.includes(k) ? f.categories.filter((c) => c !== k) : [...f.categories, k] })} />{l}</label>
          ))}
        </fieldset>
        <label className="grid gap-1">Nama kontak<input value={f.contactName} maxLength={120} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></label>
        <label className="grid gap-1">Email<input type="email" value={f.email} maxLength={200} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="grid gap-1">Telepon<input value={f.phone} maxLength={40} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label className="grid gap-1">Kontak di tim (opsional)
          <select value={f.teamContactId} onChange={(e) => setF({ ...f, teamContactId: e.target.value })}><option value="">Tidak ditautkan</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.chargesPpn} onChange={(e) => setF({ ...f, chargesPpn: e.target.checked })} />Vendor PKP (menagih PPN)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.withholdsPph23} onChange={(e) => setF({ ...f, withholdsPph23: e.target.checked })} />Dipotong PPh 23</label>
        <label className="grid gap-1">Catatan<textarea rows={3} value={f.notes} maxLength={2000} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <button className="btn" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </form>
    </Drawer>
  );
}

export function VendorPanel({ slug, canEdit, vendors, contacts }: { slug: string; canEdit: boolean; vendors: VendorRow[]; contacts: Opt[] }) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState<VendorRow | "new" | null>(null);
  const act = async (p: Promise<{ ok: boolean; error?: string }>, done: string) => {
    const r = await p;
    toast(r.ok ? { message: done } : { message: r.error ?? "Gagal.", tone: "error" });
    if (r.ok) router.refresh();
  };
  return (
    <div className="space-y-3">
      {canEdit && <button type="button" className="btn-secondary" onClick={() => setOpen("new")}>Tambah vendor</button>}
      {vendors.length === 0 && <p className="muted text-sm">Belum ada vendor.</p>}
      <ul className="rows text-sm">
        {vendors.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="font-medium">{v.name}</span>
            {v.archived && <span className="tag">Diarsipkan</span>}
            <span className="muted">{v.categories.map(categoryLabel).join(", ")}</span>
            <span className="muted">{[v.contactName, v.phone, v.email].filter(Boolean).join(" · ")}</span>
            <span className="grow" />
            {canEdit && (
              <>
                <button type="button" className="btn-ghost" onClick={() => setOpen(v)}>Ubah</button>
                <button type="button" className="btn-ghost" onClick={() => act(archiveVendor(slug, v.id, !v.archived), v.archived ? "Vendor dipulihkan." : "Vendor diarsipkan.")}>{v.archived ? "Pulihkan" : "Arsipkan"}</button>
                <form action={async () => act(removeVendor(slug, v.id), "Vendor dihapus.")}><ConfirmButton className="btn-ghost" message={`Hapus vendor "${v.name}"?`}>Hapus</ConfirmButton></form>
              </>
            )}
          </li>
        ))}
      </ul>
      {open && <VendorDrawer key={open === "new" ? "new" : open.id} slug={slug} v={open === "new" ? null : open} contacts={contacts} onClose={() => setOpen(null)} />}
    </div>
  );
}
