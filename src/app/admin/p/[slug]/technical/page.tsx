import { TechForm, type FieldHistory } from "@/components/tech-form";
import { ErrorBanner, TechSpecView } from "@/components/views";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { getTechSpec, listActivity } from "@/lib/services";

const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

export default async function Technical({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { db, project, role } = await loadProject(slug);
  const spec = await getTechSpec(db, project.id);
  const head = (
    <div>
      <h1>Technical Page</h1>
      <p className="muted mt-1 text-sm">Sumber kebenaran teknis project ini. Pilih dari opsi yang tersedia atau ketik nilai sendiri.</p>
    </div>
  );

  if (!can(role, "tech.edit")) {
    return (
      <>
        {head}
        <p className="tag tag-warn">Hanya supervisor yang bisa mengubah Technical Page.</p>
        <TechSpecView spec={spec} />
      </>
    );
  }

  const history: FieldHistory = {};
  for (const { entry, userName } of await listActivity(db, project.id, 500)) {
    if (entry.entity !== "tech_spec") continue;
    const before = (entry.before ?? {}) as Record<string, string>;
    for (const [key, to] of Object.entries((entry.after ?? {}) as Record<string, string>)) {
      (history[key] ??= []).push({ who: userName ?? "—", when: fmt.format(entry.createdAt), from: before[key] ?? "", to });
    }
  }

  return (
    <>
      {head}
      <ErrorBanner message={error} />
      <TechForm key={JSON.stringify(spec)} slug={slug} spec={spec} history={history} />
    </>
  );
}
