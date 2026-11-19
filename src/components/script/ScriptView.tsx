"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteScript, purgeScriptText } from "@/app/admin/script-actions";
import { Icon } from "@/components/ui/icons";
import type { ScriptAggregate } from "@/lib/script/aggregate";
import { fmtRange } from "@/lib/schedule/dates";
import { phaseLabel, postNeeds, type Phase } from "@/lib/script/needs";
import type { SceneRow } from "@/lib/script/service";
import { fmtDuration, TAG_KINDS, TAG_LABEL, type TagKind } from "@/lib/script/types";
import { ConfirmButton } from "@/components/ui/controls";
import { useToast } from "../ui/toast";
import { Keyed } from "./SceneReader";
import { Scenes } from "./SceneTable";

type Tab = "scenes" | "characters" | "locations" | "post" | "summary";
const TABS: [Tab, string][] = [["scenes", "Adegan"], ["characters", "Tokoh"], ["locations", "Lokasi"], ["post", "Kebutuhan post"], ["summary", "Ringkasan"]];
const th = "px-2 py-1 text-start font-medium whitespace-nowrap";

export function ScriptView({ slug, script, scenes, agg, canEdit, phases, initialTag = "", initialScene = "", textIds = [] }: { slug: string; script: { id: string; title: string; sourceName: string; pages: number }; scenes: SceneRow[]; agg: ScriptAggregate; canEdit: boolean; phases: Phase[]; initialTag?: string; initialScene?: string; textIds?: string[] }) {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("scenes");
  const [tagFilter, setTagFilter] = useState(initialTag);
  const [sceneToOpen, setSceneToOpen] = useState(initialScene);
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
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Tampilan naskah">
          {TABS.map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
        </div>
        <span className="muted text-sm tabular-nums">{script.title} · {agg.totalScenes} adegan · {script.pages} halaman · ~{fmtDuration(agg.totalSeconds)}</span>
        <span className="grow" />
        <details className="tl-details relative">
          <summary className="btn-secondary cursor-pointer" aria-label="Export"><Icon name="download" /> Export</summary>
          <div className="tl-pop" role="menu" aria-label="Export">
            {exports.map((l) => (
              <a key={l.href} role="menuitem" href={l.href} download={"download" in l ? true : undefined} onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}><Icon name={l.icon} /> {l.label}</a>
            ))}
          </div>
        </details>
        {canEdit && textIds.length > 0 && (
          <form action={async () => { const r = await purgeScriptText(slug, script.id); if (r.ok) toast({ message: "Teks naskah dihapus. Adegan dan tag tetap." }); else fail(r); }}>
            <ConfirmButton pendingLabel="Menghapus…" message="Hapus teks naskah? Teks semua adegan dan kutipan pada tag akan dihapus. Daftar adegan, tokoh, lokasi, dan tag tetap ada. Tindakan ini tidak bisa dibatalkan.">Hapus teks naskah</ConfirmButton>
          </form>
        )}
        {canEdit && (
          <button type="button" className="btn-danger" onClick={async () => { if (window.confirm(`Hapus naskah "${script.title}" beserta semua adegannya?`)) { const r = await deleteScript(slug, script.id); fail(r); if (r.ok) router.push(`/admin/p/${slug}/script`); } }}>Hapus naskah</button>
        )}
      </div>
      {tab === "scenes" && <Scenes slug={slug} scriptId={script.id} textIds={textIds} initialScene={sceneToOpen} scriptTitle={script.title} scenes={scenes} phases={phases} canEdit={canEdit} initialTag={tagFilter} />}
      {tab === "characters" && <Characters agg={agg} />}
      {tab === "locations" && <Locations agg={agg} />}
      {tab === "post" && <PostNeeds scenes={scenes} phases={phases} onShow={(k) => { setTagFilter(k); setSceneToOpen(""); setTab("scenes"); }} onOpen={(id) => { setSceneToOpen(id); setTab("scenes"); }} />}
      {tab === "summary" && <Summary agg={agg} />}
    </section>
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

function Characters({ agg }: { agg: ScriptAggregate }) {
  const s = useSort<"name" | "scenes" | "blocks">("blocks");
  const rows = [...agg.characters].sort((a, b) => (s.key === "name" ? a.name.localeCompare(b.name, "id") : a[s.key] - b[s.key]) * (s.desc ? -1 : 1));
  if (!rows.length) return <p className="muted text-sm">Tidak ada tokoh terdeteksi.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="table text-sm tabular-nums">
        <thead><tr className="text-xs">{sortHead("Tokoh", "name", s)}{sortHead("Adegan", "scenes", s)}{sortHead("Blok dialog", "blocks", s)}<th className={th}>Nomor adegan</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.name} className="hoverable">
              <td className="px-2 py-1 font-medium whitespace-nowrap">{c.name}</td>
              <td className="px-2 py-1">{c.scenes}</td>
              <td className="px-2 py-1">{c.blocks}</td>
              <td className="px-2 py-1">{c.sceneNumbers.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Locations({ agg }: { agg: ScriptAggregate }) {
  const s = useSort<"name" | "scenes" | "seconds">("scenes");
  const rows = [...agg.locations].sort((a, b) => (s.key === "name" ? a.place.localeCompare(b.place, "id") : a[s.key] - b[s.key]) * (s.desc ? -1 : 1));
  return (
    <div className="overflow-x-auto">
      <table className="table text-sm tabular-nums">
        <thead><tr className="text-xs">{sortHead("Lokasi", "name", s)}{sortHead("Adegan", "scenes", s)}{sortHead("Durasi", "seconds", s)}<th className={th}>Nomor adegan</th></tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.place} className="hoverable">
              <td className="px-2 py-1 font-medium">{l.place}</td>
              <td className="px-2 py-1">{l.scenes}</td>
              <td className="px-2 py-1 whitespace-nowrap">~{fmtDuration(l.seconds)}</td>
              <td className="px-2 py-1">{l.sceneNumbers.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function PostNeeds({ scenes, phases, onShow, onOpen }: { scenes: SceneRow[]; phases: Phase[]; onShow: (k: TagKind) => void; onOpen: (id: string) => void }) {
  const [ctx, setCtx] = useState(true);
  const needs = postNeeds(scenes, phases);
  if (!needs.length) return <p className="muted text-sm">Belum ada kebutuhan post. Tambahkan tag per adegan di tab Adegan; saran otomatis muncul saat naskah diimpor.</p>;
  return (
    <div className="space-y-6">
      <button type="button" className="btn-secondary" aria-pressed={ctx} onClick={() => setCtx(!ctx)}>Tampilkan konteks</button>
      {needs.map((n) => (
        <section key={n.kind} className="space-y-2">
          <h3 className="section-band"><span>{TAG_LABEL[n.kind]}</span><span className="section-count">{n.scenes} adegan · ~{fmtDuration(n.seconds)}</span></h3>
          <p className="text-sm tabular-nums">Adegan {n.numbers.join(", ")}{n.suggested > 0 && <span className="muted"> ({n.suggested} masih saran)</span>}</p>
          {n.phases.length > 0 && (
            <ul className="rows text-sm">
              {n.phases.map((p) => <li key={p.id} className="flex flex-wrap justify-between gap-3 py-1.5"><span>{phaseLabel(p)}</span><span className="muted tabular-nums">{fmtRange(p.startDate, p.dueDate)}</span></li>)}
            </ul>
          )}
          {n.unlinked > 0 && <p className="notice" style={{ ["--tone" as string]: "var(--warn)" }}>Belum ada fase untuk {TAG_LABEL[n.kind]}{n.phases.length > 0 ? ` (${n.unlinked} adegan)` : ""}. Pilih fase di panel adegan.</p>}
          {ctx && (
            <ul className="rows text-sm st-needs">
              {scenes.flatMap((x) => { const t = x.postTags.find((y) => y.kind === n.kind); return t ? [[x, t] as const] : []; }).map(([x, t]) => (
                <li key={x.id} className="grid gap-0.5 py-1.5">
                  <span><b className="num">{x.number}</b> <span className="text-ink-2">{x.heading}</span> <button type="button" className="btn-ghost" onClick={() => onOpen(x.id)} aria-label={`Buka adegan ${x.number}`}>Buka adegan</button></span>
                  {(t.excerpt || t.note) && <span className="st-excerpt">{t.excerpt ? <Keyed text={t.excerpt} keyword={t.keyword} k={TAG_KINDS.indexOf(n.kind) + 1} /> : t.note}</span>}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn-ghost" onClick={() => onShow(n.kind)}>Lihat adegan {TAG_LABEL[n.kind]}</button>
        </section>
      ))}
    </div>
  );
}
