import Link from "next/link";
import { notFound } from "next/navigation";
import { InputError } from "@/lib/services";
import { loadProject } from "@/lib/project-context";
import { diffDays, fmtRange } from "@/lib/schedule/dates";
import { previewShift } from "@/lib/schedule/service";
import { applyShiftAction } from "../../../../schedule-actions";

type Query = { item?: string; start?: string; due?: string; reason?: string };

export default async function ShiftPreview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Query> }) {
  const { slug } = await params;
  const q = await searchParams;
  const { db, user, project } = await loadProject(slug);
  if (!q.item || !q.start || !q.due) notFound();
  const input = { startDate: q.start, dueDate: q.due };
  const [all, single] = await Promise.all([
    previewShift(db, user.id, project.id, q.item, { ...input, cascade: true }),
    previewShift(db, user.id, project.id, q.item, { ...input, cascade: false }),
  ]).catch((e) => {
    if (e instanceof InputError) notFound();
    throw e;
  });
  const others = all.moves.filter((m) => m.id !== q.item);
  const delta = (a: string, b: string) => { const d = diffDays(a, b); return d ? `${d > 0 ? "+" : ""}${d} hr` : "tetap"; };

  return (
    <form action={applyShiftAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="itemId" value={q.item} />
      <input type="hidden" name="startDate" value={q.start} />
      <input type="hidden" name="dueDate" value={q.due} />
      <h2>Dampak perubahan jadwal “{all.item.name}”</h2>
      <p className="text-sm text-neutral-500">Belum ada yang disimpan. Periksa dampaknya, lalu pilih cara menerapkannya.</p>

      <section className="card">
        <table className="w-full">
          <thead><tr><th>Item</th><th>Sekarang</th><th>Menjadi</th><th>Due</th></tr></thead>
          <tbody>
            {all.moves.map((m) => (
              <tr key={m.id} className={`border-t border-neutral-100 ${m.id === q.item ? "font-medium" : ""}`}>
                <td>{m.name}</td>
                <td>{fmtRange(m.oldStart, m.oldDue)}</td>
                <td>{fmtRange(m.newStart, m.newDue)}</td>
                <td>{delta(m.oldDue, m.newDue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {all.conflicts.length > 0 && (
        <section role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-medium">Bentrok jika semua yang bergantung ikut digeser:</div>
          <ul className="list-disc pl-5">{all.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>
      )}
      {single.conflicts.length > 0 && (
        <section className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-medium">Bentrok jika hanya item ini yang diubah:</div>
          <ul className="list-disc pl-5">{single.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>
      )}

      <div className="card space-y-3">
        <label><span>Alasan perubahan (opsional)</span><input name="reason" defaultValue={q.reason} /></label>
        <div className="flex flex-wrap items-center gap-3">
          {others.length > 0 && <button name="mode" value="cascade" className="btn">Terapkan dan geser {others.length} item yang bergantung</button>}
          <button name="mode" value="single" className="btn">Ubah item ini saja</button>
          <Link href={`/admin/p/${slug}/timeline`} className="text-sm underline">Batal</Link>
        </div>
      </div>
    </form>
  );
}
