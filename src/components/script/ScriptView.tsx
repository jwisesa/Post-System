"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { confirmSceneTag, deleteScript, purgeScriptText, setSceneTags } from "@/app/admin/script-actions";
import { Icon } from "@/components/ui/icons";
import type { ScriptAggregate } from "@/lib/script/aggregate";
import { phaseLabel, postNeeds, type Phase } from "@/lib/script/needs";
import type { SceneRow } from "@/lib/script/service";
import { fmtDuration, withCustom, type KindDef } from "@/lib/script/types";
import { ConfirmButton } from "@/components/ui/controls";
import { useToast } from "../ui/toast";
import { KindManager, KindsProvider, type CustomKindRow } from "./kinds";
import { Keyed } from "./SceneReader";
import { Scenes } from "./SceneTable";
import { MergedNote, MergeTools, pickBox, useMergeSelect, type MergeCtx } from "./merge";
import type { Alias } from "@/lib/script/aliases";

type Tab = "scenes" | "characters" | "locations" | "post" | "summary";
const TABS: [Tab, string][] = [["scenes", "Adegan"], ["characters", "Tokoh"], ["locations", "Lokasi"], ["post", "Kebutuhan post"], ["summary", "Ringkasan"]];
const th = "px-2 py-1 text-start font-medium whitespace-nowrap";

export function ScriptView({ slug, script, scenes, agg, canEdit, phases, initialTag = "", initialScene = "", textIds = [], customKinds = [], kindUsage = {}, aliases = [] }: { aliases?: Alias[]; slug: string; script: { id: string; title: string; sourceName: string; pages: number }; scenes: SceneRow[]; agg: ScriptAggregate; canEdit: boolean; phases: Phase[]; initialTag?: string; initialScene?: string; textIds?: string[]; customKinds?: CustomKindRow[]; kindUsage?: Record<string, number> }) {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("scenes");
  const [managing, setManaging] = useState(false);
  const kinds = useMemo(() => withCustom(customKinds), [customKinds]);
  const [tagFilter, setTagFilter] = useState(initialTag);
  const [sceneToOpen, setSceneToOpen] = useState(initialScene);
  const [from, setFrom] = useState<Tab>("scenes"); // the tab a scene was opened from; closing the drawer returns there
  const fail = (r: { ok: boolean; error?: string }) => { if (!r.ok) toast({ message: r.error ?? "Gagal menyimpan.", tone: "error" }); };
  const exportHref = (type: string) => `/admin/p/${slug}/script/export?script=${script.id}&type=${type}`;
  const pdf = (view: string) => `/admin/p/${slug}/script/print?script=${script.id}&view=${view}`;
  const exports = [
    { href: pdf("scenes"), icon: "print", label: "PDF breakdown adegan" }, { href: pdf("characters"), icon: "print", label: "PDF tokoh" },
    { href: pdf("locations"), icon: "print", label: "PDF lokasi" }, { href: pdf("post"), icon: "print", label: "PDF kebutuhan post" },
    { href: exportHref("scenes"), icon: "download", label: "CSV adegan", download: true }, { href: exportHref("characters"), icon: "download", label: "CSV tokoh", download: true },
    { href: exportHref("locations"), icon: "download", label: "CSV lokasi", download: true }, { href: exportHref("post"), icon: "download", label: "CSV kebutuhan post", download: true },
  ] as const;

  return (
    <KindsProvider value={kinds}>
    <section className="space-y-3 sm:space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="seg st-tabs" role="group" aria-label="Tampilan naskah">
          {TABS.map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
        </div>
        <span className="muted text-sm tabular-nums max-sm:hidden">{script.title} · {agg.totalScenes} adegan · {script.pages} halaman · ~{fmtDuration(agg.totalSeconds)}</span>
        <span className="grow max-sm:hidden" />
        <details className="tl-details relative">
          <summary className="btn-secondary cursor-pointer" aria-label="Export"><Icon name="download" /> Export</summary>
          <div className="tl-pop" role="menu" aria-label="Export">
            {exports.map((l) => (
              <a key={l.href} role="menuitem" href={l.href} download={"download" in l ? true : undefined} onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}><Icon name={l.icon} /> {l.label}</a>
            ))}
          </div>
        </details>
        <button type="button" className="btn-secondary" onClick={() => setManaging(true)}>Jenis tag</button>
        {canEdit && (
          <details className="tl-details relative">
            <summary className="btn-secondary cursor-pointer" aria-label="Lainnya">⋯</summary>
            <div className="tl-pop st-more" role="menu" aria-label="Lainnya">
              {textIds.length > 0 && (
                <form action={async () => { const r = await purgeScriptText(slug, script.id); if (r.ok) toast({ message: "Teks naskah dihapus. Adegan dan tag tetap." }); else fail(r); }}>
                  <ConfirmButton className="btn-ghost" pendingLabel="Menghapus…" message="Hapus teks naskah? Teks semua adegan dan kutipan pada tag akan dihapus. Daftar adegan, tokoh, lokasi, dan tag tetap ada. Tindakan ini tidak bisa dibatalkan.">Hapus teks naskah</ConfirmButton>
                </form>
              )}
              <form action={async () => { const r = await deleteScript(slug, script.id); fail(r); if (r.ok) router.push(`/admin/p/${slug}/script`); }}>
                <ConfirmButton className="btn-ghost" pendingLabel="Menghapus…" message={`Hapus naskah "${script.title}" beserta semua adegannya?`}>Hapus naskah</ConfirmButton>
              </form>
            </div>
          </details>
        )}
      </div>
      {tab === "scenes" && <Scenes slug={slug} scriptId={script.id} textIds={textIds} initialScene={sceneToOpen} scriptTitle={script.title} scenes={scenes} phases={phases} canEdit={canEdit} initialTag={tagFilter} onClose={() => { setSceneToOpen(""); setTab(from); }} />}
      {tab === "characters" && <Characters agg={agg} ctx={{ slug, scriptId: script.id, kind: "character", canEdit, aliases, items: agg.characters }} />}
      {tab === "locations" && <Locations agg={agg} ctx={{ slug, scriptId: script.id, kind: "location", canEdit, aliases, items: agg.locations.map((l) => ({ name: l.place, scenes: l.scenes, blocks: l.scenes, sceneNumbers: l.sceneNumbers })) }} />}
      {tab === "post" && <PostNeeds kinds={kinds} slug={slug} canEdit={canEdit} scenes={scenes} phases={phases} onShow={(k) => { setTagFilter(k); setSceneToOpen(""); setFrom("scenes"); setTab("scenes"); }} onOpen={(id, kind) => { setTagFilter(kind); setSceneToOpen(id); setFrom("post"); setTab("scenes"); }} />}
      {tab === "summary" && <Summary agg={agg} />}
      {managing && <KindManager slug={slug} custom={customKinds} usage={kindUsage} canEdit={canEdit} onClose={() => setManaging(false)} />}
    </section>
    </KindsProvider>
  );
}

function useSort<K extends string>(initial: K) {
  const [key, setKey] = useState<K>(initial);
  const [desc, setDesc] = useState(true);
  const toggle = (k: K) => { if (k === key) setDesc(!desc); else { setKey(k); setDesc(k !== "name"); } };
  return { key, desc, toggle };
}

const sortHead = (label: string, k: string, s: { key: string; desc: boolean; toggle: (k: never) => void }) => (
  <th className={th} aria-sort={s.key === k ? (s.desc ? "descending" : "ascending") : "none"}>
    <button type="button" className="font-medium" onClick={() => s.toggle(k as never)}>{label}{s.key === k ? (s.desc ? " ↓" : " ↑") : ""}</button>
  </th>
);

function Characters({ agg, ctx }: { agg: ScriptAggregate; ctx: MergeCtx }) {
  const m = useMergeSelect();
  const s = useSort<"name" | "scenes" | "blocks">("blocks");
  const rows = [...agg.characters].sort((a, b) => (s.key === "name" ? a.name.localeCompare(b.name, "id") : a[s.key] - b[s.key]) * (s.desc ? -1 : 1));
  if (!rows.length) return <p className="muted text-sm">Tidak ada tokoh terdeteksi.</p>;
  return (
    <div className="space-y-3"><MergeTools ctx={ctx} s={m} />
    <div className="overflow-x-auto">
      <table className="table text-sm tabular-nums">
        <thead><tr className="text-xs">{ctx.canEdit && <th className={th}><span className="sr-only">Pilih</span></th>}{sortHead("Tokoh", "name", s)}{sortHead("Adegan", "scenes", s)}{sortHead("Blok dialog", "blocks", s)}<th className={th}>Nomor adegan</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.name} className="hoverable">
              {ctx.canEdit && <td className="px-1">{pickBox(ctx, m, c.name)}</td>}
              <td className="px-2 py-1 font-medium whitespace-nowrap">{c.name}<MergedNote ctx={ctx} name={c.name} /></td>
              <td className="px-2 py-1">{c.scenes}</td>
              <td className="px-2 py-1">{c.blocks}</td>
              <td className="px-2 py-1">{c.sceneNumbers.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div></div>
  );
}

function Locations({ agg, ctx }: { agg: ScriptAggregate; ctx: MergeCtx }) {
  const m = useMergeSelect();
  const s = useSort<"name" | "scenes" | "seconds">("scenes");
  const rows = [...agg.locations].sort((a, b) => (s.key === "name" ? a.place.localeCompare(b.place, "id") : a[s.key] - b[s.key]) * (s.desc ? -1 : 1));
  return (
    <div className="space-y-3"><MergeTools ctx={ctx} s={m} />
    <div className="overflow-x-auto">
      <table className="table text-sm tabular-nums">
        <thead><tr className="text-xs">{ctx.canEdit && <th className={th}><span className="sr-only">Pilih</span></th>}{sortHead("Lokasi", "name", s)}{sortHead("Adegan", "scenes", s)}{sortHead("Durasi", "seconds", s)}<th className={th}>Nomor adegan</th></tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.place} className="hoverable">
              {ctx.canEdit && <td className="px-1">{pickBox(ctx, m, l.place)}</td>}
              <td className="px-2 py-1 font-medium">{l.place}<MergedNote ctx={ctx} name={l.place} /></td>
              <td className="px-2 py-1">{l.scenes}</td>
              <td className="px-2 py-1 whitespace-nowrap">~{fmtDuration(l.seconds)}</td>
              <td className="px-2 py-1">{l.sceneNumbers.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div></div>
  );
}

function Split({ label, parts }: { label: string; parts: [string, number][] }) {
  const total = parts.reduce((n, [, v]) => n + v, 0) || 1;
  return (
    <div className="space-y-1">
      <h3 className="field-label">{label}</h3>
      {parts.map(([name, v]) => (
        <div key={name} className="sa-bar text-sm"><span>{name}</span><div className="meter"><span style={{ width: `${(v / total) * 100}%` }} /></div><span className="tabular-nums">{v}</span></div>
      ))}
    </div>
  );
}

function Summary({ agg }: { agg: ScriptAggregate }) {
  const facts: [string, string][] = [["Adegan", String(agg.totalScenes)], ["Halaman", String(agg.pages)], ["Perkiraan durasi", fmtDuration(agg.totalSeconds)], ["Tokoh", String(agg.characters.length)], ["Lokasi", String(agg.locations.length)], ["Blok dialog", String(agg.dialogueBlocks)]];
  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        {facts.map(([k, v]) => <div key={k}><dt className="field-label">{k}</dt><dd className="stat-num !text-3xl tabular-nums">{v}</dd></div>)}
      </dl>
      <div className="grid gap-8 md:grid-cols-2">
        <Split label="INT / EXT" parts={[["INT", agg.intExt.INT], ["EXT", agg.intExt.EXT], ["INT/EXT", agg.intExt["INT/EXT"]]]} />
        <Split label="Siang / malam" parts={[["Siang (pagi, siang, sore)", agg.day], ["Malam (malam, subuh)", agg.night], ["Lainnya / tidak tertulis", agg.timeOfDay.LAINNYA + agg.timeOfDay[""]]]} />
        <Split label="Tokoh teratas (blok dialog)" parts={agg.characters.slice(0, 5).map((c) => [c.name, c.blocks])} />
        <Split label="Lokasi teratas (adegan)" parts={[...agg.locations].slice(0, 5).map((l) => [l.place, l.scenes])} />
      </div>
    </div>
  );
}

function PostNeeds({ slug, scenes, phases, kinds, canEdit, onShow, onOpen }: { slug: string; scenes: SceneRow[]; phases: Phase[]; kinds: KindDef[]; canEdit: boolean; onShow: (k: string) => void; onOpen: (id: string, kind: string) => void }) {
  const toast = useToast();
  const needs = postNeeds(scenes, phases, kinds);
  const act = async (p: Promise<{ ok: boolean; error?: string }>, done: string) => { const r = await p; toast(r.ok ? { message: done } : { message: r.error ?? "Gagal menyimpan.", tone: "error" }); };
  if (!needs.length) return <p className="muted text-sm">Belum ada kebutuhan post. Tambahkan tag per adegan di tab Adegan; saran otomatis muncul saat naskah diimpor.</p>;
  return (
    <div className="space-y-6">
      {needs.map((n) => {
        const L = n.label;
        const rows = scenes.flatMap((x) => { const t = x.postTags.find((y) => y.kind === n.kind); return t ? [[x, t] as const] : []; });
        const ids = [...new Set(rows.map(([, t]) => t.itemId ?? ""))];
        const cur = ids.length === 1 && phases.some((p) => p.id === ids[0]) ? ids[0] : "";
        return (
          <section key={n.kind} className="space-y-2">
            <h3 className="section-band"><span>{L}</span>
              <button type="button" className="section-count st-count" onClick={() => onShow(n.kind)} aria-label={`Lihat adegan ${L}`}>{n.scenes} adegan · ~{fmtDuration(n.seconds)}</button></h3>
            {canEdit ? (
              <label className="sa-inline"><span>Fase:</span>
                <select aria-label={`Fase untuk semua adegan ${L}`} value={cur} onChange={(e) => act(setSceneTags(slug, rows.map(([x]) => x.id), { kind: n.kind, itemId: e.target.value || null }), `Fase ${L} diatur untuk ${rows.length} adegan.`)}>
                  <option value="">{ids.length > 1 ? "Beragam / belum dipilih" : "Belum dipilih"}</option>
                  {phases.map((p) => <option key={p.id} value={p.id}>{phaseLabel(p)}</option>)}
                </select></label>
            ) : null}
            {n.phases.length > 0 && (
              <ul className="rows text-sm">
                {n.phases.map((p) => <li key={p.id} className="py-1.5"><Link href={`/admin/p/${slug}/timeline?item=${p.id}`} className="st-link">{phaseLabel(p)}</Link></li>)}
              </ul>
            )}
            {n.unlinked > 0 && <p className="notice" style={{ ["--tone" as string]: "var(--warn)" }}>Belum ada fase untuk {L}{n.phases.length > 0 ? ` (${n.unlinked} adegan)` : ""}. Pilih fase di atas atau di panel adegan.</p>}
            <ul className="rows text-sm st-needs">
              {rows.map(([x, t]) => (
                <li key={x.id} className="st-need">
                  <button type="button" className="st-need-row" onClick={() => onOpen(x.id, n.kind)} aria-label={`Buka adegan ${x.number}`}>
                    <span><b className="num">{x.number}</b> <span className="text-ink-2">{x.heading}</span></span>
                    {(t.excerpt || t.note) && <span className="st-excerpt">{t.excerpt ? <Keyed text={t.excerpt} keyword={t.keyword} k={n.color} /> : t.note}</span>}
                  </button>
                  {canEdit && t.auto && <button type="button" className="btn-ghost" onClick={() => act(confirmSceneTag(slug, x.id, n.kind), `Tag ${L} dikonfirmasi.`)}>Konfirmasi</button>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
