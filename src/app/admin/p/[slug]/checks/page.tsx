import Link from "next/link";
import { getChecks } from "@/lib/checks/service";
import { loadProject } from "@/lib/project-context";
import { today } from "@/lib/schedule/dates";

const SEVERITIES = [["error", "Error", "tag-danger"], ["warn", "Peringatan", "tag-warn"], ["info", "Info", "tag-accent"]] as const;

export default async function Checks({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, project } = await loadProject(slug);
  const findings = await getChecks(db, project.id, slug, today());
  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      <div>
        <h1 className="page-title">Pemeriksaan <span className="muted">{findings.length}</span></h1>
        <p className="page-meta">Perbandingan Technical Page, deliverables, dan jadwal. Hanya peringatan; tidak menghalangi apa pun.</p>
      </div>
      {findings.length === 0 && <p className="text-[13px] text-ink-2">Tidak ada temuan.</p>}
      {SEVERITIES.map(([sev, label, tone]) => {
        const rows = findings.filter((f) => f.severity === sev);
        if (!rows.length) return null;
        return (
          <section key={sev}>
            <div className="section-band"><h2>{label}</h2><span className="section-count">{rows.length}</span></div>
            <ul className="rows">
              {rows.map((f, n) => (
                <li key={n} className="py-3">
                  <div className="text-sm font-semibold"><span className={`tag ${tone}`}>{label}</span> {f.title}</div>
                  <p className="text-[13px] text-ink-2">{f.detail}</p>
                  <Link href={f.fix.href} className="text-[13px] font-semibold underline underline-offset-2">{f.fix.label}</Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
