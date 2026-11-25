"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { addScopeBid, archiveVendor, removeVendor, saveScope, saveVendor } from "@/app/admin/budget-actions";
import { ConfirmButton, Drawer } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { categoryLabel, SERVICE_CATEGORIES } from "@/lib/budget/catalog";
import { MoneyError, parseRupiah } from "@/lib/budget/money";

export type VendorRow = { id: string; name: string; categories: string[]; contactName: string; email: string; phone: string; teamContactId: string | null; chargesPpn: boolean; withholdsPph23: boolean; notes: string; archived: boolean };
type Opt = { id: string; name: string };

function VendorDrawer({ slug, v, contacts, used, scopes, onClose }: { scopes: Opt[]; used: string[]; slug: string; v: VendorRow | null; contacts: Opt[]; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [f, setF] = useState({ name: v?.name ?? "", categories: v?.categories ?? [], contactName: v?.contactName ?? "", email: v?.email ?? "", phone: v?.phone ?? "", teamContactId: v?.teamContactId ?? "", chargesPpn: v?.chargesPpn ?? true, withholdsPph23: v?.withholdsPph23 ?? true, notes: v?.notes ?? "" });
  const [busy, setBusy] = useState(false);
  const [toScope, setToScope] = useState("");
  const [newBudget, setNewBudget] = useState("");
  const [cat, setCat] = useState("");
  const addCat = () => {
    const t = cat.trim();
    if (!t) return;
    const code = Object.entries(SERVICE_CATEGORIES).find(([k, l]) => k === t || l.toLowerCase() === t.toLowerCase())?.[0] ?? t; // built-in label maps back to its code
    if (!f.categories.some((c) => c.toLowerCase() === code.toLowerCase())) setF({ ...f, categories: [...f.categories, code] });
    setCat("");
  };
  const [first] = useState(() => JSON.stringify(f));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let budget = 0;
    if (toScope === "new" && newBudget.trim()) { try { budget = parseRupiah(newBudget); } catch (x) { toast({ message: x instanceof MoneyError ? x.message : "Budget tidak valid.", tone: "error" }); return; } }
    setBusy(true);
    const r = await saveVendor(slug, v?.id ?? null, { ...f, teamContactId: f.teamContactId || null });
    if (!r.ok) { setBusy(false); toast({ message: r.error, tone: "error" }); return; }
    let note = "Vendor disimpan.";
    const vendorId = (r as { vendorId?: string }).vendorId;
    if (!v && toScope && vendorId) {
      let scopeId = toScope;
      if (toScope === "new") {
        const first = f.categories[0];
        const sc = await saveScope(slug, null, { name: first ? categoryLabel(first) : f.name, category: first && Object.hasOwn(SERVICE_CATEGORIES, first) ? first : "other", budget, phaseIds: [], deliverableIds: [], notes: "" });
        scopeId = sc.ok ? (sc as { scopeId?: string }).scopeId ?? "" : "";
        if (!sc.ok) note = `Vendor disimpan, tetapi lingkup gagal dibuat: ${sc.error}`;
      }
      if (scopeId) {
        const a = await addScopeBid(slug, scopeId, vendorId);
        note = a.ok ? "Vendor disimpan dan ditambahkan ke lingkup." : `Vendor disimpan, tetapi gagal ditambahkan ke lingkup: ${a.error}`;
      }
    }
    setBusy(false);
    toast({ message: note });
    onClose();
    router.refresh();
  };
  return (
    <Drawer title={v ? "Ubah vendor" : "Tambah vendor"} crumb="Anggaran & vendor" dirty={JSON.stringify(f) !== first || !!toScope} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 text-sm">
        <label className="grid gap-1">Nama vendor<input value={f.name} maxLength={120} required onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <fieldset className="grid gap-1"><legend className="mb-1">Kategori</legend>
          {Object.entries(SERVICE_CATEGORIES).filter(([k]) => k !== "other").map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={f.categories.includes(k)} onChange={() => setF({ ...f, categories: f.categories.includes(k) ? f.categories.filter((c) => c !== k) : [...f.categories, k] })} />{l}</label>
          ))}
          {f.categories.filter((c) => !Object.hasOwn(SERVICE_CATEGORIES, c) || c === "other").map((c) => (
            <span key={c} className="flex items-center gap-2">{categoryLabel(c)}<button type="button" className="btn-ghost" aria-label={`Hapus kategori ${categoryLabel(c)}`} onClick={() => setF({ ...f, categories: f.categories.filter((x) => x !== c) })}>Hapus</button></span>
          ))}
          <div className="flex gap-2">
            <input list="vendor-cats" aria-label="Kategori lain" placeholder="Kategori lain, mis. Color science" maxLength={40} value={cat} onChange={(e) => setCat(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addCat(); } }} />
            <button type="button" className="btn-secondary" onClick={addCat}>Tambah</button>
          </div>
          <datalist id="vendor-cats">{[...new Set([...Object.values(SERVICE_CATEGORIES).filter((l) => l !== "Lainnya"), ...used.map(categoryLabel)])].map((l) => <option key={l} value={l} />)}</datalist>
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
        {!v && (
          <fieldset className="grid gap-2"><legend className="mb-1">Tambahkan ke lingkup (opsional)</legend>
            <label className="grid gap-1"><span className="sr-only">Tambahkan ke lingkup</span>
              <select aria-label="Tambahkan ke lingkup" value={toScope} onChange={(e) => setToScope(e.target.value)}><option value="">Jangan dulu</option>{scopes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="new">Lingkup baru…</option></select>
            </label>
            {toScope === "new" && <label className="grid gap-1">Budget lingkup baru, sebelum pajak (Rp, opsional)<input inputMode="numeric" placeholder="150.000.000" value={newBudget} onChange={(e) => setNewBudget(e.target.value)} /></label>}
          </fieldset>
        )}
        <button className="btn" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </form>
    </Drawer>
  );
}

export function VendorPanel({ slug, canEdit, vendors, contacts, scopes, summaryHref }: { scopes: Opt[]; summaryHref: string; slug: string; canEdit: boolean; vendors: VendorRow[]; contacts: Opt[] }) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState<VendorRow | "new" | null>(null);
  const [pend, setPend] = useState<string | null>(null);
  const act = async (p: Promise<{ ok: boolean; error?: string }>, done: string) => {
    const r = await p;
    toast(r.ok ? { message: done } : { message: r.error ?? "Gagal.", tone: "error" });
    if (r.ok) router.refresh();
  };
  return (
    <div className="space-y-3">
      {canEdit && <button type="button" className="btn-secondary" onClick={() => setOpen("new")}>Tambah vendor</button>}
      {vendors.length === 0 && <p className="muted text-sm">Belum ada vendor.{scopes.length === 0 && <> <Link href={summaryHref} replace scroll={false} className="underline">Buat lingkup dulu</Link> agar vendor bisa langsung diberi penawaran.</>}</p>}
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
                <button type="button" className="btn-ghost" disabled={!!pend} onClick={async () => { setPend(v.id); await act(archiveVendor(slug, v.id, !v.archived), v.archived ? "Vendor dipulihkan." : "Vendor diarsipkan."); setPend(null); }}>{pend === v.id ? "Menyimpan…" : v.archived ? "Pulihkan" : "Arsipkan"}</button>
                <form action={async () => act(removeVendor(slug, v.id), "Vendor dihapus.")}><ConfirmButton className="btn-ghost" pendingLabel="Menyimpan…" message={`Hapus vendor "${v.name}"?`}>Hapus</ConfirmButton></form>
              </>
            )}
          </li>
        ))}
      </ul>
      {open && <VendorDrawer key={open === "new" ? "new" : open.id} slug={slug} v={open === "new" ? null : open} contacts={contacts} scopes={scopes} used={[...new Set(vendors.flatMap((x) => x.categories))]} onClose={() => setOpen(null)} />}
    </div>
  );
}
