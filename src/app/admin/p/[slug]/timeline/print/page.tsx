import { PrintActions } from "@/components/timeline/PrintActions";
import { loadProject } from "@/lib/project-context";
import { addDays, diffDays, fmtDate, today as todayWib } from "@/lib/schedule/dates";
import { getSchedule } from "@/lib/schedule/service";
import { statusLabel } from "@/lib/schedule/templates";
import { calOf, workDays } from "@/lib/schedule/workdays";

const W = 1000, GUTTER = 220, ROW = 18, HEAD = 22;
const MONTH = new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit", timeZone: "UTC" });
const dowOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

type Item = Awaited<ReturnType<typeof getSchedule>>["tracks"][number]["items"][number];

function Gantt({ items }: { items: Item[] }) {
  const phases = items.filter((i) => !i.parentId);
  if (!phases.length) return null;
  const today = todayWib();
  const min = items.reduce((m, i) => (i.startDate < m ? i.startDate : m), items[0].startDate);
  const max = items.reduce((m, i) => (i.dueDate > m ? i.dueDate : m), items[0].dueDate);
  const start = `${min.slice(0, 8)}01`;
  const end = addDays(max, 1);
  const span = Math.max(1, diffDays(start, end));
  const x = (d: string) => GUTTER + (diffDays(start, d) / span) * (W - GUTTER);
  const H = HEAD + phases.length * ROW + 4;
  const months: string[] = [];
  for (let d = start; d < end; ) { months.push(d); const [y, m] = d.split("-").map(Number); d = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`; }
  const weeks: string[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) if (dowOf(d) === 1) weeks.push(d);
  const color = (n: number) => `var(--ph-${n}, #5b7fa6)`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Gantt" fontSize="9" fontFamily="inherit">
      {weeks.map((d) => <line key={d} x1={x(d)} x2={x(d)} y1={HEAD} y2={H} stroke="currentColor" strokeOpacity="0.07" strokeWidth="0.5" />)}
      {months.map((d) => (
        <g key={d}>
          <line x1={x(d)} x2={x(d)} y1={0} y2={H} stroke="currentColor" strokeOpacity="0.25" strokeWidth="0.5" />
          <text x={x(d) + 3} y={11} fill="currentColor">{MONTH.format(new Date(`${d}T00:00:00Z`))}</text>
        </g>
      ))}
      <line x1={0} x2={W} y1={HEAD} y2={HEAD} stroke="currentColor" strokeOpacity="0.25" strokeWidth="0.5" />
      {phases.map((p, idx) => {
        const y = HEAD + idx * ROW, c = color(p.color ?? (idx % 8) + 1);
        return (
          <g key={p.id}>
            <text x={0} y={y + 12} fill="currentColor">{p.name.length > 40 ? `${p.name.slice(0, 39)}…` : p.name}</text>
            <rect x={x(p.startDate)} y={y + 4} width={Math.max(2, x(addDays(p.dueDate, 1)) - x(p.startDate))} height={ROW - 8} fill={c} />
            {items.filter((m) => m.parentId === p.id).map((m) => {
              const cx = x(m.dueDate) + (x(addDays(m.dueDate, 1)) - x(m.dueDate)) / 2, cy = y + ROW / 2;
              return <path key={m.id} d={`M${cx} ${cy - 5}L${cx + 5} ${cy}L${cx} ${cy + 5}L${cx - 5} ${cy}Z`} fill={m.color ? color(m.color) : c} stroke="#fff" strokeWidth="0.75" />;
            })}
          </g>
        );
      })}
      {today >= start && today < end && <line x1={x(today)} x2={x(today)} y1={HEAD} y2={H} stroke="var(--today, #006f4f)" strokeWidth="1.5" />}
    </svg>
  );
}

export default async function PrintTimeline({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, project } = await loadProject(slug);
  const { tracks, settings } = await getSchedule(db, project.id, { includeInternal: true });
  const cal = calOf(settings);
  return (
    <>
      <style>{`@page { size: A4 landscape; margin: 12mm; } .print-track { break-inside: avoid; } @media print { body * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }`}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1>{project.name}</h1>
          <p className="text-sm">Jadwal pasca produksi</p>
          <p className="muted text-sm">Dicetak {fmtDate(todayWib())}</p>
        </div>
        <PrintActions backHref={`/admin/p/${slug}/timeline`} />
      </div>
      {tracks.length === 0 && <p className="muted text-sm">Belum ada track.</p>}
      {tracks.map((t) => (
        <section key={t.id} className="print-track space-y-2">
          <h2 className="border-b border-line pb-1">{t.name}</h2>
          <Gantt items={t.items} />
          <table className="w-full text-sm">
            <thead><tr className="muted text-left"><th className="py-1 font-normal">Nama</th><th className="py-1 font-normal">Mulai</th><th className="py-1 font-normal">Selesai</th><th className="py-1 text-right font-normal">Hari kerja</th><th className="py-1 pl-4 font-normal">Status</th><th className="py-1 font-normal">PIC</th></tr></thead>
            <tbody className="divide-y divide-line">
              {t.items.map((i) => (
                <tr key={i.id}>
                  <td className={`py-1 ${i.parentId ? "pl-4" : "font-medium"}`}>
                    {i.parentId && <span aria-hidden className="mr-2 inline-block size-1.5 rotate-45 bg-current align-middle" />}{i.name}
                  </td>
                  <td className="py-1">{fmtDate(i.startDate)}</td>
                  <td className="py-1">{fmtDate(i.dueDate)}</td>
                  <td className="py-1 text-right">{workDays(cal, i.startDate, i.dueDate)}</td>
                  <td className="py-1 pl-4">{statusLabel(i.status)}</td>
                  <td className="py-1">{i.picName ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
