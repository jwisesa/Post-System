import { ErrorBanner, TechSpecView } from "@/components/views";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { getTechSpec } from "@/lib/services";
import { TECH_SECTIONS } from "@/lib/tech-spec/schema";
import { updateTechSpecAction } from "../../../actions";

export default async function Technical({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { db, project, role } = await loadProject(slug);
  const spec = await getTechSpec(db, project.id);

  if (!can(role, "tech.edit")) {
    return (
      <>
        <p className="text-sm text-neutral-500">Hanya supervisor yang bisa mengubah Technical Page.</p>
        <TechSpecView spec={spec} />
      </>
    );
  }

  return (
    <form action={updateTechSpecAction} className="space-y-4">
      <ErrorBanner message={error} />
      <input type="hidden" name="slug" value={slug} />
      <p className="text-sm text-neutral-500">Pilih dari opsi yang tersedia atau ketik nilai sendiri. Setiap perubahan tercatat di change log.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {TECH_SECTIONS.map((section) => (
          <section key={section.title} className="card space-y-3">
            <h2>{section.title}</h2>
            {section.fields.map((f) => (
              <label key={f.key}>
                <span>{f.label}</span>
                {f.key === "notes" ? (
                  <textarea name={f.key} rows={5} defaultValue={spec[f.key]} />
                ) : (
                  <>
                    <input name={f.key} list={f.options.length ? `opt-${f.key}` : undefined} defaultValue={spec[f.key]} placeholder={f.hint} />
                    {f.options.length > 0 && (
                      <datalist id={`opt-${f.key}`}>
                        {f.options.map((o) => <option key={o} value={o} />)}
                      </datalist>
                    )}
                  </>
                )}
              </label>
            ))}
          </section>
        ))}
      </div>
      <div className="card flex items-end gap-3">
        <label className="flex-1"><span>Alasan perubahan (opsional)</span><input name="reason" /></label>
        <button className="btn">Simpan Technical Page</button>
      </div>
    </form>
  );
}
