"use client";

import { createContext, useContext, useId, useState } from "react";
import { createTagKind, deleteTagKind, moveTagKind, updateTagKind } from "@/app/admin/script-actions";
import { ConfirmButton, Drawer, SubmitButton } from "@/components/ui/controls";
import { BUILTIN_KINDS, kindDef, MAX_CUSTOM_KINDS, MAX_KIND_LABEL, type KindDef } from "@/lib/script/types";
import { useToast } from "../ui/toast";

/** Built-ins plus the project's custom kinds; `of(key)` never throws (a deleted custom key is humanised, neutral colour). */
const Ctx = createContext<KindDef[]>(BUILTIN_KINDS);
export const KindsProvider = Ctx.Provider;
export function useKinds() {
  const kinds = useContext(Ctx);
  return { kinds, of: (key: string) => kindDef(kinds, key) };
}

export type CustomKindRow = { id: string; key: string; label: string; color: number };

/** The 8 phase-colour swatches as radios (same pattern as the phase colour field). */
export function ColorPick({ value, onChange, label = "Warna" }: { value: number; onChange: (c: number) => void; label?: string }) {
  const name = useId();
  return (
    <fieldset className="st-colors">
      <legend className="sr-only">{label}</legend>
      {Array.from({ length: 8 }, (_, n) => n + 1).map((c) => (
        <label key={c} className="swatch-radio" title={`Warna ${c}`}>
          <input type="radio" name={name} className="sr-only" aria-label={`Warna ${c}`} checked={value === c} onChange={() => onChange(c)} />
          <span className="swatch" data-ph={c} style={{ background: "var(--c)" }} />
        </label>
      ))}
    </fieldset>
  );
}

type Res = { ok: boolean; error?: string };

/** Name + colour. Used by the manager and by the reader's "+ Jenis baru" chip. */
export function NewKindForm({ label, onCreate, onCancel, inBar }: { label: string; onCreate: (v: { label: string; color: number }) => Promise<boolean>; onCancel?: () => void; inBar?: boolean }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(3);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    const ok = await onCreate({ label: name, color });
    setBusy(false);
    if (ok) setName("");
  };
  const body = (
    <>
      <input aria-label="Nama jenis tag" placeholder="Nama jenis tag" maxLength={MAX_KIND_LABEL} value={name} autoFocus={inBar} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go(); } }} />
      <ColorPick value={color} onChange={setColor} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" disabled={busy || !name.trim()} onClick={go}>{busy ? "Menyimpan…" : label}</button>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Batal</button>}
      </div>
    </>
  );
  return inBar ? <div className="st-newkind">{body}</div> : <div className="st-newkind" role="group" aria-label="Tambah jenis">{body}</div>;
}

function KindRow({ slug, k, i, n, used }: { slug: string; k: CustomKindRow; i: number; n: number; used: number }) {
  const toast = useToast();
  const act = async (p: Promise<Res>, done: string) => { const r = await p; toast(r.ok ? { message: done } : { message: r.error ?? "Gagal menyimpan.", tone: "error" }); };
  return (
    <li className="st-kindrow grid gap-2 py-3">
      <form className="flex flex-wrap items-center gap-2" action={async (f) => { await act(updateTagKind(slug, k.id, { label: String(f.get("label") ?? "") }), "Nama jenis tag disimpan."); }}>
        <input name="label" aria-label={`Nama jenis tag ${k.label}`} defaultValue={k.label} maxLength={MAX_KIND_LABEL} required className="min-w-0 flex-1" />
        <SubmitButton className="btn-secondary" pendingLabel="Menyimpan…">Simpan</SubmitButton>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <ColorPick value={k.color} label={`Warna ${k.label}`} onChange={(color) => act(updateTagKind(slug, k.id, { color }), "Warna disimpan.")} />
        <span className="grow" />
        <button type="button" className="btn-ghost" aria-label={`Naikkan ${k.label}`} disabled={i === 0} onClick={() => act(moveTagKind(slug, k.id, -1), "Urutan diubah.")}>Naik</button>
        <button type="button" className="btn-ghost" aria-label={`Turunkan ${k.label}`} disabled={i === n - 1} onClick={() => act(moveTagKind(slug, k.id, 1), "Urutan diubah.")}>Turun</button>
        <form action={async () => { await act(deleteTagKind(slug, k.id), `Jenis tag ${k.label} dihapus.`); }}>
          <ConfirmButton className="btn-ghost" pendingLabel="Menghapus…" aria-label={`Hapus jenis tag ${k.label}`}
            message={used ? `Hapus jenis tag "${k.label}"? ${used} tag pada adegan di project ini akan ikut dihapus. Tindakan ini tidak bisa dibatalkan.` : `Hapus jenis tag "${k.label}"?`}>Hapus</ConfirmButton>
        </form>
      </div>
      <p className="muted text-xs tabular-nums">{used} tag pada adegan</p>
    </li>
  );
}

export function KindManager({ slug, custom, usage, canEdit, onClose }: { slug: string; custom: CustomKindRow[]; usage: Record<string, number>; canEdit: boolean; onClose: () => void }) {
  const toast = useToast();
  return (
    <Drawer title="Jenis tag" crumb="Naskah" onClose={onClose}>
      <div className="space-y-6 text-sm">
        <section className="space-y-1">
          <h3>Bawaan</h3>
          <ul className="rows">
            {BUILTIN_KINDS.map((k) => <li key={k.key} className="py-1.5"><span className="sa-tagm" data-k={k.color}>{k.label}</span></li>)}
          </ul>
        </section>
        <section className="space-y-1">
          <h3>Jenis sendiri</h3>
          {custom.length === 0 && <p className="muted">Belum ada. Jenis sendiri berlaku untuk semua naskah di project ini.</p>}
          <ul className="rows">{custom.map((k, i) => <KindRow key={`${k.id}:${k.label}:${k.color}`} slug={slug} k={k} i={i} n={custom.length} used={usage[k.key] ?? 0} />)}</ul>
        </section>
        {canEdit && (custom.length < MAX_CUSTOM_KINDS ? (
          <section className="space-y-2">
            <h3>Tambah jenis</h3>
            <NewKindForm label="Tambah jenis" onCreate={async (v) => { const r = await createTagKind(slug, v); toast(r.ok ? { message: `Jenis tag ${v.label.trim()} ditambahkan.` } : { message: r.error, tone: "error" }); return r.ok; }} />
          </section>
        ) : <p className="muted">Batas {MAX_CUSTOM_KINDS} jenis sendiri per project tercapai.</p>)}
      </div>
    </Drawer>
  );
}
