// Read-only renderers shared by the view-only link and restricted admin roles.
import { PRODUCTION_TYPES, TECH_SECTIONS, type TechSpec } from "@/lib/tech-spec/schema";
import type { getTeam } from "@/lib/services";

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p>;
}

export function productionTypeLabel(value: string) {
  return PRODUCTION_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function ProjectSummary({ project }: { project: { productionType: string; platforms: string[]; unitCount: number | null } }) {
  return (
    <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
      <dt className="text-neutral-500">Tipe produksi</dt>
      <dd>{productionTypeLabel(project.productionType)}</dd>
      <dt className="text-neutral-500">Platform tujuan</dt>
      <dd>{project.platforms.join(", ") || "—"}</dd>
      <dt className="text-neutral-500">Episode / reel</dt>
      <dd>{project.unitCount ?? "—"}</dd>
    </dl>
  );
}

export function TechSpecView({ spec }: { spec: TechSpec }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {TECH_SECTIONS.map((section) => (
        <section key={section.title} className="card">
          <h2 className="mb-2">{section.title}</h2>
          <dl className="grid grid-cols-[11rem_1fr] gap-y-1 text-sm">
            {section.fields.map((f) => (
              <div key={f.key} className="contents">
                <dt className="text-neutral-500">{f.label}</dt>
                <dd className="whitespace-pre-wrap">{spec[f.key] || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

type Team = Awaited<ReturnType<typeof getTeam>>;

export function ContactFlags({ c }: { c: Team[number]["contacts"][number] }) {
  return (
    <span className="space-x-1">
      {c.isPic && <span className="tag">PIC</span>}
      {c.isContact && <span className="tag">Contact</span>}
      {c.needsAccess && <span className="tag">Perlu akses</span>}
      {c.internal && <span className="tag bg-amber-200">Internal</span>}
    </span>
  );
}

export function TeamView({ team }: { team: Team }) {
  const filled = team.filter((g) => g.contacts.length);
  if (!filled.length) return <p className="text-sm text-neutral-500">Belum ada kontak.</p>;
  return (
    <div className="space-y-4">
      {filled.map((g) => (
        <section key={g.id} className="card">
          <h2 className="mb-2">{g.name}</h2>
          <table className="w-full">
            <thead>
              <tr><th>Nama</th><th>Jabatan</th><th>Perusahaan</th><th>Email</th><th>Telepon</th><th>Catatan</th></tr>
            </thead>
            <tbody>
              {g.contacts.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100">
                  <td>{c.name} <ContactFlags c={c} /></td>
                  <td>{c.jobTitle}</td>
                  <td>{c.company}</td>
                  <td>{c.email && <a className="text-blue-700" href={`mailto:${c.email}`}>{c.email}</a>}</td>
                  <td>{c.phone}</td>
                  <td>{c.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
