import { notFound } from "next/navigation";
import { Fragment } from "react";
import { PrintActions } from "@/components/timeline/PrintActions";
import { loadProject } from "@/lib/project-context";
import { fmtDate, today } from "@/lib/schedule/dates";
import { phaseLabel, postNeeds } from "@/lib/script/needs";
import { getKinds, getScript, listPhases } from "@/lib/script/service";
import { fmtDuration, fmtPage, kindDef } from "@/lib/script/types";

const VIEWS = { scenes: "Breakdown adegan", characters: "Tokoh", locations: "Lokasi", post: "Kebutuhan post" } as const;
const th = "py-1 pe-3 text-left font-normal";
const td = "py-1 pe-3 align-top";

export default async function PrintScript({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ script?: string; view?: string }> }) {
  const { slug } = await params;
  const q = await searchParams;
  const { db, project } = await loadProject(slug);
  const data = await getScript(db, project.id, q.script ?? "");
  if (!data) notFound();
  const view = (q.view && q.view in VIEWS ? q.view : "scenes") as keyof typeof VIEWS;
  const { script, scenes, aggregate: agg } = data;
  const kinds = await getKinds(db, project.id);
  const phases = view === "post" ? await listPhases(db, project.id) : [];
  return (
    <>
      <style>{`@page { size: A4 landscape; margin: 12mm; } .print-sheet tr { break-inside: avoid; } .print-sheet thead { display: table-header-group; } @media print { body * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }`}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1>{project.name}</h1>
          <p className="text-sm">{VIEWS[view]} · {script.title}</p>
          <p className="muted text-sm">{agg.totalScenes} adegan · {script.pages} halaman · perkiraan {fmtDuration(agg.totalSeconds)} · Dicetak {fmtDate(today())}</p>
        </div>
        <PrintActions backHref={`/admin/p/${slug}/script?script=${script.id}`} backLabel="Kembali ke naskah" />
      </div>
      <table className="print-sheet mt-4 w-full text-sm tabular-nums">
        {view === "scenes" && (
          <>
            <thead className="border-b border-line"><tr className="muted">{["No", "Judul adegan", "INT/EXT", "Waktu", "Hal.", "Durasi", "Tokoh", "Tag post", "Catatan"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {scenes.map((s) => (
                <tr key={s.id}>
                  <td className={`${td} font-medium`}>{s.number}</td><td className={td}>{s.heading}</td><td className={td}>{s.intExt}</td><td className={td}>{s.timeOfDay}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmtPage(s.pageStart)}–{fmtPage(s.pageEnd)}</td><td className={`${td} whitespace-nowrap`}>~{fmtDuration(s.estSeconds)}</td>
                  <td className={td}>{s.characters.map((c) => c.name).join(", ")}</td><td className={td}>{s.postTags.map((t) => kindDef(kinds, t.kind).label + (t.auto ? "?" : "")).join(", ")}</td><td className={td}>{s.notes}</td>
                </tr>
              ))}
            </tbody>
          </>
        )}
        {view === "characters" && (
          <>
            <thead className="border-b border-line"><tr className="muted">{["Tokoh", "Adegan", "Blok dialog", "Nomor adegan"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{agg.characters.map((c) => <tr key={c.name}><td className={`${td} font-medium`}>{c.name}</td><td className={td}>{c.scenes}</td><td className={td}>{c.blocks}</td><td className={td}>{c.sceneNumbers.join(", ")}</td></tr>)}</tbody>
          </>
        )}
        {view === "locations" && (
          <>
            <thead className="border-b border-line"><tr className="muted">{["Lokasi", "Adegan", "Durasi", "Nomor adegan"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{agg.locations.map((l) => <tr key={l.place}><td className={`${td} font-medium`}>{l.place}</td><td className={td}>{l.scenes}</td><td className={td}>~{fmtDuration(l.seconds)}</td><td className={td}>{l.sceneNumbers.join(", ")}</td></tr>)}</tbody>
          </>
        )}
        {view === "post" && (
          <>
            <thead className="border-b border-line"><tr className="muted">{["Kebutuhan", "Adegan", "Durasi", "Nomor adegan", "Fase terkait"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {postNeeds(scenes, phases, kinds).map((n) => (
                <Fragment key={n.kind}>
                <tr>
                  <td className={`${td} font-medium`}>{n.label}</td><td className={td}>{n.scenes}{n.suggested > 0 && ` (${n.suggested} saran)`}</td><td className={td}>~{fmtDuration(n.seconds)}</td><td className={td}>{n.numbers.join(", ")}</td>
                  <td className={td}>{n.phases.map((p) => phaseLabel(p)).join("; ")}{n.unlinked > 0 && <span className="block">Belum ada fase untuk {n.unlinked} adegan</span>}</td>
                </tr>
                {scenes.flatMap((s) => { const t = s.postTags.find((y) => y.kind === n.kind); return t && (t.excerpt || t.note) ? [[s, t] as const] : []; }).map(([s, t]) => (
                  <tr key={s.id} className="muted"><td className={td} /><td className={td} colSpan={4}><b>{s.number}</b> {s.heading}{t.note && ` · ${t.note}`}{t.excerpt && <span className="block">{t.excerpt}</span>}</td></tr>
                ))}
                </Fragment>
              ))}
            </tbody>
          </>
        )}
      </table>
    </>
  );
}
