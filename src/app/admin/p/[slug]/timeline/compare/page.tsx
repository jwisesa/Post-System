import Link from "next/link";
import { loadProject } from "@/lib/project-context";
import type { DiffRow } from "@/lib/schedule/compare";
import { addDays, diffDays, fmtRange } from "@/lib/schedule/dates";
import { getComparison, listVersions } from "@/lib/schedule/service";
import { InputError } from "@/lib/services";

const W = 1000, GUTTER = 220, ROW = 18, HEAD = 22;
const MONTH = new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit", timeZone: "UTC" });
const KIND = { changed: "Bergeser", added: "Baru", removed: "Hilang", renamed: "Ganti nama", same: "Sama" } as const;
const hk = (n: number) => `${n > 0 ? "+" : ""}${n} hk`;
const tone = (n: number) => (n > 0 ? "text-danger" : "muted");

function Gantt({ rows, colors }: { rows: DiffRow[]; colors: Map<string, number> }) {
  const dates = rows.flatMap((r) => [r.old?.start, r.old?.due, r.now?.start, r.now?.due].filter((d): d is string => !!d)).sort();
  if (!dates.length) return null;
  const start = `${dates[0].slice(0, 8)}01`, end = addDays(dates.at(-1)!, 1);
  const span = Math.max(1, diffDays(start, end));
  const x = (d: string) => GUTTER + (diffDays(start, d) / span) * (W - GUTTER);
  const H = HEAD + rows.length * ROW + 4;
  const months: string[] = [];
  for (let d = start; d < end; ) { months.push(d); const [y, m] = d.split("-").map(Number); d = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`; }
  const fill = (r: DiffRow, idx: number) => `var(--ph-${colors.get(r.id) ?? (idx % 8) + 1}, #5b7fa6)`;
  const bar = (r: { start: string; due: string }, y: number, milestone: boolean, c: string, ghost: boolean) => {
    if (milestone) {
      const cx = x(r.due) + (x(addDays(r.due, 1)) - x(r.due)) / 2, cy = y + ROW / 2;
      return <path d={`M${cx} ${cy - 5}L${cx + 5} ${cy}L${cx} ${cy + 5}L${cx - 5} ${cy}Z`} fill={c} fillOpacity={ghost ? 0.3 : 1} stroke={ghost ? c : "#fff"} strokeWidth="0.75" strokeDasharray={ghost ? "2 1" : undefined} />;
    }
    return <rect x={x(r.start)} y={y + 4} width={Math.max(2, x(addDays(r.due, 1)) - x(r.start))} height={ROW - 8} fill={c} fillOpacity={ghost ? 0.3 : 1} stroke={ghost ? c : undefined} strokeDasharray={ghost ? "3 2" : undefined} strokeWidth="0.75" />;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Perbandingan Gantt" fontSize="9" fontFamily="inherit">
      {months.map((d) => (
        <g key={d}>
          <line x1={x(d)} x2={x(d)} y1={0} y2={H} stroke="currentColor" strokeOpacity="0.25" strokeWidth="0.5" />
          <text x={x(d) + 3} y={11} fill="currentColor">{MONTH.format(new Date(`${d}T00:00:00Z`))}</text>
        </g>
      ))}
      <line x1={0} x2={W} y1={HEAD} y2={HEAD} stroke="currentColor" strokeOpacity="0.25" strokeWidth="0.5" />
      {rows.map((r, idx) => {
        const y = HEAD + idx * ROW, c = fill(r, idx), ms = !!r.parent;
        const label = r.name.length > 38 ? `${r.name.slice(0, 37)}…` : r.name;
        return (
          <g key={r.id}>
            <text x={ms ? 8 : 0} y={y + 12} fill="currentColor" opacity={r.kind === "removed" ? 0.5 : 1}>{label}</text>
            {r.old && r.kind !== "same" && bar(r.old, y, ms, c, true)}
            {r.now && bar(r.now, y, ms, c, false)}
          </g>
        );
      })}
    </svg>
  );
}

export default async function ComparePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const { slug } = await params;
  const q = await searchParams;
  const { db, project } = await loadProject(slug);
  const versions = await listVersions(db, project.id);
  const a = q.a || versions[0]?.id || "now", b = q.b || "now";
  let cmp: Awaited<ReturnType<typeof getComparison>> | null = null, error = "";
  try { cmp = await getComparison(db, project.id, a, b); } catch (e) { if (e instanceof InputError) error = e.message; else throw e; }
  const colors = new Map<string, number>();
  const rows = cmp?.rows ?? [];
  for (const s of [cmp?.a.snapshot, cmp?.b.snapshot]) for (const i of s?.items ?? []) if (i.color) colors.set(i.id, i.color);
  const count = (k: DiffRow["kind"]) => rows.filter((r) => r.kind === k).length;
  const summary = [[count("changed") + count("renamed"), "bergeser"], [count("added"), "baru"], [count("removed"), "hilang"]].filter(([n]) => n).map(([n, l]) => `${n} ${l}`).join(", ");
  const options = (
    <>
      <option value="now">Sekarang</option>
      {versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
    </>
  );
  return (
    <div className="compare space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Bandingkan versi</h1>
        <Link className="btn-secondary" href={`/admin/p/${slug}/timeline`}>Kembali ke timeline</Link>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label><span>Lama</span><select name="a" defaultValue={a}>{options}</select></label>
        <label><span>Baru</span><select name="b" defaultValue={b}>{options}</select></label>
        <button className="btn-secondary">Bandingkan</button>
      </form>
      {error && <p className="text-danger text-sm">{error}</p>}
      {cmp && (
        <>
          <p className="muted text-sm">Perbedaan dihitung dengan kalender hari kerja project saat ini</p>
          {rows.length === 0 ? <p className="muted text-sm">Kedua sisi kosong.</p> : <Gantt rows={rows} colors={colors} />}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">{summary || "Tidak ada perbedaan"}</p>
            <a className="btn-secondary" href={`/admin/p/${slug}/timeline/compare/export?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`} download>Unduh CSV</a>
          </div>
          <table className="table w-full text-sm">
            <thead><tr className="muted text-left"><th className="font-normal">Item</th><th className="font-normal">Tipe</th><th className="font-normal">{cmp.a.label}</th><th className="font-normal">{cmp.b.label}</th><th className="text-right font-normal">Selisih</th></tr></thead>
            <tbody>
              {rows.filter((r) => r.kind !== "same").map((r) => (
                <tr key={r.id}>
                  <td className={r.parent ? "pl-4" : "font-medium"}>{r.name}{r.oldName && <span className="muted"> (dulu {r.oldName})</span>}<span className="muted"> · {r.track}</span></td>
                  <td>{KIND[r.kind]}</td>
                  <td className="tabular-nums">{r.old ? fmtRange(r.old.start, r.old.due) : ""}</td>
                  <td className="tabular-nums">{r.now ? fmtRange(r.now.start, r.now.due) : ""}</td>
                  <td className="text-right tabular-nums">{r.old && r.now && (r.dStart || r.dDue) ? <><span className={tone(r.dStart)}>{hk(r.dStart)}</span> / <span className={tone(r.dDue)}>{hk(r.dDue)}</span></> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
