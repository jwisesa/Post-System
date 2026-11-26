"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { mergeScriptNames, unmergeScriptName } from "@/app/admin/script-actions";
import { Drawer, SubmitButton } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { MAX_ALIAS_NAME, suggestPairs, type Alias, type AliasKind } from "@/lib/script/aliases";

export type MergeItem = { name: string; scenes: number; blocks: number; sceneNumbers: string[] };
export type MergeCtx = { slug: string; scriptId: string; kind: AliasKind; canEdit: boolean; aliases: Alias[]; items: MergeItem[] };
const WORD = { character: "tokoh", location: "lokasi" } as const;

/** Selection state for a table of mergeable names. */
export function useMergeSelect() {
  const [sel, setSel] = useState<string[]>([]);
  return { sel, toggle: (n: string) => setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n])), clear: () => setSel([]) };
}

export const pickBox = (ctx: MergeCtx, s: ReturnType<typeof useMergeSelect>, name: string) => ctx.canEdit && (
  <label className="inline-flex min-h-11 min-w-11 items-center justify-center"><input type="checkbox" checked={s.sel.includes(name)} onChange={() => s.toggle(name)} aria-label={`Pilih ${name}`} /></label>
);

/** "Mungkin sama" strip plus the sticky "Gabungkan (n)" bar and its drawer. */
export function MergeTools({ ctx, s }: { ctx: MergeCtx; s: ReturnType<typeof useMergeSelect> }) {
  const [names, setNames] = useState<string[] | null>(null);
  if (!ctx.canEdit) return null;
  const pairs = suggestPairs(ctx.items, ctx.kind);
  return (
    <>
      {pairs.length > 0 && (
        <div className="notice space-y-1" style={{ ["--tone" as string]: "var(--warn)" }}>
          <p className="text-sm font-medium">Mungkin sama</p>
          <ul className="text-sm">
            {pairs.map(([a, b]) => (
              <li key={a + "|" + b} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 break-words">{a} <span className="muted">dan</span> {b}</span>
                <button type="button" className="btn-ghost min-h-11" onClick={() => setNames([a, b])}>Gabungkan</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.sel.length > 0 && (
        <div className="sticky bottom-0 z-10 flex items-center gap-3 border-t border-line bg-paper py-2" role="region" aria-label="Aksi terpilih">
          <button type="button" className="btn min-h-11" disabled={s.sel.length < 2} onClick={() => setNames(s.sel)}>Gabungkan ({s.sel.length})</button>
          <button type="button" className="btn-ghost min-h-11" onClick={s.clear}>Batal</button>
          {s.sel.length < 2 && <span className="muted text-sm">Pilih minimal dua.</span>}
        </div>
      )}
      {names && <MergeDrawer ctx={ctx} names={names} onClose={() => setNames(null)} onDone={() => { setNames(null); s.clear(); }} />}
    </>
  );
}

function MergeDrawer({ ctx, names, onClose, onDone }: { ctx: MergeCtx; names: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const items = names.map((n) => ctx.items.find((i) => i.name === n)).filter((i): i is MergeItem => !!i);
  const [main, setMain] = useState(items.slice().sort((a, b) => b.scenes - a.scenes)[0]?.name ?? "");
  const [custom, setCustom] = useState("");
  const canonical = (custom.trim() || main).toUpperCase();
  const scenes = new Set(items.flatMap((i) => i.sceneNumbers)).size;
  const hits = items.reduce((n, i) => n + (ctx.kind === "character" ? i.blocks : i.scenes), 0);
  const w = WORD[ctx.kind];
  return (
    <Drawer title={`Gabungkan ${w}`} crumb="Naskah" onClose={onClose}>
      <form className="space-y-5 text-sm" action={async () => {
        const r = await mergeScriptNames(ctx.slug, ctx.scriptId, ctx.kind, names, canonical);
        if (r.ok) { toast({ message: `${items.length} ${w} digabung menjadi ${canonical}.` }); router.refresh(); onDone(); } else toast({ message: r.error ?? "Gagal menggabungkan.", tone: "error" });
      }}>
        <fieldset className="space-y-1">
          <legend className="field-label">Nama utama</legend>
          {items.map((i) => (
            <label key={i.name} className="flex min-h-11 items-center gap-3">
              <input type="radio" name="main" checked={!custom.trim() && main === i.name} onChange={() => { setMain(i.name); setCustom(""); }} />
              <span className="min-w-0 grow break-words font-medium">{i.name}</span>
              <span className="muted tabular-nums">{i.scenes} adegan</span>
            </label>
          ))}
        </fieldset>
        <label className="block space-y-1">
          <span className="field-label">Atau ketik nama baru</span>
          <input value={custom} maxLength={MAX_ALIAS_NAME} onChange={(e) => setCustom(e.target.value)} className="min-h-11 w-full" autoComplete="off" />
        </label>
        <p className="tabular-nums">{scenes} adegan, {hits} kemunculan setelah digabung sebagai <b>{canonical}</b>.</p>
        <p className="muted">Data adegan tidak diubah. Penggabungan bisa dipisahkan lagi.</p>
        <SubmitButton className="btn min-h-11" pendingLabel="Menggabungkan…">Gabungkan</SubmitButton>
      </form>
    </Drawer>
  );
}

/** Small "digabung: A, B" disclosure under a merged name, with an unmerge button per alias. */
export function MergedNote({ ctx, name }: { ctx: MergeCtx; name: string }) {
  const toast = useToast();
  const router = useRouter();
  const from = ctx.aliases.filter((a) => a.kind === ctx.kind && a.toName === name);
  if (!from.length) return null;
  return (
    <details className="text-xs font-normal">
      <summary className="muted cursor-pointer">digabung: {from.map((a) => a.fromName).join(", ")}</summary>
      <ul className="mt-1 space-y-1">
        {from.map((a) => (
          <li key={a.fromName} className="flex items-center gap-2">
            <span className="min-w-0 break-words">{a.fromName}</span>
            {ctx.canEdit && <button type="button" className="btn-ghost min-h-11" onClick={async () => { const r = await unmergeScriptName(ctx.slug, ctx.scriptId, ctx.kind, a.fromName); if (r.ok) { toast({ message: `${a.fromName} dipisahkan.` }); router.refresh(); } else toast({ message: r.error ?? "Gagal memisahkan.", tone: "error" }); }}>Pisahkan</button>}
          </li>
        ))}
      </ul>
    </details>
  );
}
