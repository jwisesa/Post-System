import { FramingTool } from "@/components/framing/FramingTool";
import { listCharts } from "@/lib/framing/service";
import { loadProject } from "@/lib/project-context";

export default async function FramingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const q = await searchParams;
  const { db, project } = await loadProject(slug);
  const initial = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v ?? ""]));
  const charts = (await listCharts(db, project.id)).map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() }));
  const openedId = charts.find((c) => c.id === initial.chart)?.id ?? null;
  return (
    <div className="page space-y-6" data-w="full">
      <div className="page-head"><div>
        <h1 className="page-title">Framing Chart</h1>
        <p className="page-meta">Chart bingkai untuk tes kamera: framing decision, safety, panduan rasio, dan target fokus. Unduh PNG pada resolusi asli sensor atau cetak PDF.</p>
      </div></div>
      <FramingTool slug={slug} project={project.name} initial={initial} charts={charts} openedId={openedId} />
    </div>
  );
}
