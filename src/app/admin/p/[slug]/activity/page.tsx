import { loadProject } from "@/lib/project-context";
import { listActivity } from "@/lib/services";
import { TECH_FIELDS } from "@/lib/tech-spec/schema";

const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const show = (v: unknown) => (v === "" || v == null ? "—" : Array.isArray(v) ? v.join(", ") : String(v));
const label = (key: string) => TECH_FIELDS.find((f) => f.key === key)?.label ?? key;

/** Field-level "old → new" lines for update entries. */
function diff(before: unknown, after: unknown): string[] {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return [];
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  return Object.keys(a).filter((k) => show(b[k]) !== show(a[k])).map((k) => `${label(k)}: ${show(b[k])} → ${show(a[k])}`);
}

export default async function Activity({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, project } = await loadProject(slug);
  const log = await listActivity(db, project.id);
  return (
    <ul className="card divide-y divide-neutral-100">
      {log.map(({ entry, userName }) => (
        <li key={entry.id} className="py-2 text-sm">
          <div><span className="font-medium">{userName ?? "—"}</span> · {entry.summary}</div>
          {entry.action === "update" && diff(entry.before, entry.after).map((line) => <div key={line} className="text-neutral-600">{line}</div>)}
          {entry.reason && <div className="text-neutral-600">Alasan: {entry.reason}</div>}
          <div className="text-xs text-neutral-400">{fmt.format(entry.createdAt)} WIB</div>
        </li>
      ))}
    </ul>
  );
}
