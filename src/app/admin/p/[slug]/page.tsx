import { ProjectFields } from "@/components/project-fields";
import { ErrorBanner, ProjectSummary } from "@/components/views";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { updateProjectAction } from "../../actions";

export default async function Overview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { project, role } = await loadProject(slug);
  return (
    <>
      <ErrorBanner message={error} />
      <section className="card"><ProjectSummary project={project} /></section>
      {can(role, "project.edit") && (
        <form action={updateProjectAction} className="card space-y-3">
          <h2>Ubah info project</h2>
          <input type="hidden" name="slug" value={slug} />
          <ProjectFields project={project} />
          <button className="btn">Simpan</button>
        </form>
      )}
    </>
  );
}
