import { loadProject } from "@/lib/project-context";
import { listActivity } from "@/lib/services";
import { TECH_FIELDS } from "@/lib/tech-spec/schema";

const day = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
const time = new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" });
const show = (v: unknown) => (v === "" || v == null ? "—" : Array.isArray(v) ? v.join(", ") : String(v));
const label = (key: string) => TECH_FIELDS.find((f) => f.key === key)?.label ?? key;

const KINDS: Record<string, string> = {
  schedule: "Jadwal", schedule_item: "Jadwal", track: "Jadwal", dependency: "Jadwal",
  deliverable: "Deliverables", attachment: "Aset", comment: "Komentar", tech_spec: "Technical Page", team_contact: "Tim", team_group: "Tim", member: "Akses", share_link: "Akses", project: "Project",
};

/** Field-level "old → new" lines for update entries. */
function diff(before: unknown, after: unknown): string[] {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return [];
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  return Object.keys(a).filter((k) => show(b[k]) !== show(a[k])).map((k) => `${label(k)}: ${show(b[k])} → ${show(a[k])}`);
}

export default async function Activity({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ who?: string; kind?: string }> }) {
  const { slug } = await params;
  const { who = "", kind = "" } = await searchParams;
  const { db, project } = await loadProject(slug);
  const all = await listActivity(db, project.id, 500);
  const people = [...new Set(all.map((l) => l.userName).filter(Boolean))] as string[];
  const kinds = [...new Set(Object.values(KINDS))];
  const log = all.filter((l) => (!who || l.userName === who) && (!kind || KINDS[l.entry.entity] === kind));
  const groups = new Map<string, typeof log>();
  for (const l of log) {
    const key = day.format(l.entry.createdAt);
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }

  return (
    <>
      <h1>Change log</h1>
      <form className="flex flex-wrap items-center gap-2">
        <select name="who" defaultValue={who} aria-label="Filter orang" className="max-w-48">
          <option value="">Semua orang</option>
          {people.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select name="kind" defaultValue={kind} aria-label="Filter jenis" className="max-w-48">
          <option value="">Semua jenis</option>
          {kinds.map((k) => <option key={k}>{k}</option>)}
        </select>
        <button className="btn-secondary">Terapkan</button>
      </form>
      {log.length === 0 && <p className="card muted text-sm">Tidak ada perubahan yang cocok.</p>}
      {[...groups].map(([date, entries]) => (
        <section key={date}>
          <h2 className="muted mb-2 text-xs font-medium tracking-wide uppercase">{date}</h2>
          <ul className="card divide-y divide-line py-1">
            {entries.map(({ entry, userName }) => (
              <li key={entry.id} className="flex gap-3 py-2.5 text-sm">
                <span className="muted w-12 shrink-0 text-xs tabular-nums">{time.format(entry.createdAt)}</span>
                <div className="min-w-0 flex-1">
                  <div><span className="font-medium">{userName ?? "—"}</span> <span className="muted">·</span> {entry.summary}</div>
                  {entry.action === "update" && diff(entry.before, entry.after).map((line) => <div key={line} className="muted">{line}</div>)}
                  {entry.reason && <div className="mt-0.5 text-warn">Alasan: {entry.reason}</div>}
                </div>
                <span className="tag h-fit">{KINDS[entry.entity] ?? entry.entity}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
