// Read-only renderers shared by the view-only link and restricted admin roles.
import { PRODUCTION_TYPES, TECH_SECTIONS, type TechSpec } from "@/lib/tech-spec/schema";
import type { getTeam } from "@/lib/services";

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{message}</p>;
}

export function productionTypeLabel(value: string) {
  return PRODUCTION_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function ProjectSummary({ project }: { project: { productionType: string; platforms: string[]; unitCount: number | null } }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="tag tag-accent">{productionTypeLabel(project.productionType)}</span>
      {project.platforms.map((p) => <span key={p} className="tag">{p}</span>)}
      {project.unitCount && <span className="tag">{project.unitCount} episode / reel</span>}
    </div>
  );
}

export function TechSpecView({ spec }: { spec: TechSpec }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {TECH_SECTIONS.map((section) => (
        <section key={section.title} className="card">
          <h2 className="mb-3">{section.title}</h2>
          <dl className="grid grid-cols-[minmax(0,11rem)_1fr] gap-x-3 gap-y-1.5 text-sm">
            {section.fields.map((f) => (
              <div key={f.key} className="contents">
                <dt className="muted">{f.label}</dt>
                <dd className={`whitespace-pre-wrap ${spec[f.key] ? "font-medium" : "muted"}`}>{spec[f.key] || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export type Team = Awaited<ReturnType<typeof getTeam>>;
export type Contact = Team[number]["contacts"][number];

export function ContactFlags({ c }: { c: Contact }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {c.isPic && <span className="tag tag-accent">PIC</span>}
      {c.isContact && <span className="tag">Contact</span>}
      {c.needsAccess && <span className="tag tag-ok">Perlu akses</span>}
      {c.internal && <span className="tag tag-warn">Internal</span>}
    </span>
  );
}
