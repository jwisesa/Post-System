import { notFound } from "next/navigation";
import { FramingChart } from "@/components/framing/FramingChart";
import { PrintActions } from "@/components/timeline/PrintActions";
import { chartFonts } from "@/components/framing/fonts";
import { buildSpec, parseState } from "@/lib/framing/frame";
import { getChart } from "@/lib/framing/service";
import { loadProject } from "@/lib/project-context";

/** One page exactly the chart's pixel size, SVG edge to edge (vector). Screen view scales it to fit. */
export default async function PrintFraming({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const { db, project } = await loadProject(slug);
  const q = await searchParams;
  // ?chart=<id> alone prints that saved chart (project-scoped); explicit settings in the URL win
  const id = typeof q.chart === "string" ? q.chart : "", saved = id && !Object.keys(q).some((k) => k !== "chart") ? await getChart(db, project.id, id) : null;
  if (id && !Object.keys(q).some((k) => k !== "chart") && !saved) notFound();
  const spec = buildSpec(saved ? parseState(saved.state, project.name) : parseState(q, project.name));
  return (
    <>
      <style>{`
        @page { size: ${spec.W}px ${spec.H}px; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: none !important; width: ${spec.W}px; height: ${spec.H}px; overflow: hidden; }
          body * { visibility: hidden; }
          .fc-sheet, .fc-sheet * { visibility: visible; }
          .fc-sheet { position: fixed; inset: 0; width: ${spec.W}px !important; height: ${spec.H}px !important; max-width: none !important; margin: 0 !important; z-index: 99999; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }`}</style>
      <div className="mb-3 print:hidden"><PrintActions backHref={`/admin/p/${slug}/framing`} backLabel="Kembali ke framing chart" /></div>
      <div className="fc-sheet" style={{ width: "100%", maxWidth: "100%", aspectRatio: `${spec.W} / ${spec.H}` }}><FramingChart spec={spec} fonts={chartFonts} fill /></div>
    </>
  );
}
