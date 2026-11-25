import { PrintActions } from "@/components/timeline/PrintActions";
import { FramingChart } from "@/components/framing/FramingChart";
import { chartFonts } from "@/components/framing/fonts";
import { buildSpec, parseState } from "@/lib/framing/frame";
import { loadProject } from "@/lib/project-context";

export default async function PrintFraming({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const { project } = await loadProject(slug);
  const spec = buildSpec(parseState(await searchParams, project.name));
  return (
    <>
      <style>{`@page { size: A4 landscape; margin: 8mm; } @media print { body * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }`}</style>
      <div className="mb-3"><PrintActions backHref={`/admin/p/${slug}/framing`} backLabel="Kembali ke framing chart" /></div>
      <div style={{ maxWidth: "277mm" }}><FramingChart spec={spec} fonts={chartFonts} /></div>
    </>
  );
}
