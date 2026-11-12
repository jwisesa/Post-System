import { fmtDate } from "@/lib/schedule/dates";
import type { TodayData } from "@/lib/today/service";

/** Plain-text summary for pasting into WhatsApp. */
export function summaryText(projectName: string, today: string, d: TodayData): string {
  const line = (e: { name: string; context: string; dueDate: string }) => `- ${e.name} (${e.context}) · ${fmtDate(e.dueDate)}`;
  const lines = [
    `*${projectName}* · ${fmtDate(today)}`,
    `Hari ini: ${d.dueToday.length} · Terlambat: ${d.late.length} · 7 hari ke depan: ${d.next7.length}`,
    `Deliverables: ${d.deliverables.done} / ${d.deliverables.total} terkirim`,
    "",
    "*Terlambat*",
    ...(d.late.length ? d.late.map(line) : ["- Tidak ada"]),
    "",
    "*7 hari ke depan*",
    ...(d.next7.length ? d.next7.map(line) : ["- Tidak ada"]),
  ];
  return lines.join("\n");
}
