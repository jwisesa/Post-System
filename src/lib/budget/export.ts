// CSV rows for the budget exports. Amounts are plain integer Rupiah (no separators), all headers say "(Rp)". Pre-tax unless a column says otherwise.
import type { Db } from "@/db/client";
import { can } from "../auth/permissions";
import { getProjectForUser } from "../services";
import { categoryLabel, VERSION_STATUSES, type VersionStatusCode } from "./catalog";
import { lineAmount } from "./money";
import { invoiceState, rollup } from "./rollup";
import { buildComparison } from "./scenarios";
import { getBudget } from "./service";
import { DRIVE_STATUS, MEDIA, PURPOSES } from "./drives";

export const EXPORT_TYPES = ["scopes", "versions", "invoices", "drives", "scenarios"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];
const INV_STATUS = { planned: "Rencana", received: "Diterima", cancelled: "Dibatalkan" } as const;
const n = (x: number) => String(x);
/** Text cells only: a leading = + - @ tab or CR would run as a spreadsheet formula, so prefix an apostrophe. Amounts (n) stay untouched. */
export const csvText = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** Route guard: 401 not signed in, 404 not a member, 403 without budget.view. */
export async function authorizeBudgetExport(db: Db, user: { id: string } | null, slug: string): Promise<{ ok: true; projectId: string; userId: string; slug: string } | { ok: false; status: 401 | 403 | 404; message: string }> {
  if (!user) return { ok: false, status: 401, message: "Unauthorized" };
  const row = await getProjectForUser(db, user.id, slug);
  if (!row) return { ok: false, status: 404, message: "Not found" };
  if (!can(row.role, "budget.view")) return { ok: false, status: 403, message: "Forbidden" };
  return { ok: true, projectId: row.project.id, userId: user.id, slug: row.project.slug };
}

export async function budgetCsvRows(db: Db, userId: string, projectId: string, type: ExportType): Promise<string[][]> {
  const data = await getBudget(db, userId, projectId); // requires budget.view
  const scopeName = (id: string) => data.scopes.find((s) => s.id === id)?.name ?? "";
  const vendorName = (id: string) => data.vendors.find((v) => v.id === id)?.name ?? "";
  if (type === "scopes") {
    const { rows, total } = rollup(data);
    return [
      ["Lingkup", "Kategori", "Vendor terpilih", "Budget (Rp)", "Dipilih (Rp)", "Ditagih (Rp)", "Dibayar (Rp)", "Selisih (Rp)"],
      ...rows.map((r) => {
        const s = data.scopes.find((x) => x.id === r.scopeId)!;
        const bid = data.bids.find((b) => b.id === data.picks.find((p) => p.scopeId === s.id)?.bidId);
        return [csvText(s.name), categoryLabel(s.category), bid ? csvText(vendorName(bid.vendorId)) : "", n(r.budget), n(r.chosen), n(r.invoiced), n(r.paid), n(r.variance)];
      }),
      ["Total", "", "", n(total.budget), n(total.chosen), n(total.invoiced), n(total.paid), n(total.budget - total.chosen)],
    ];
  }
  if (type === "versions") {
    return [
      ["Lingkup", "Vendor", "Dokumen", "Nomor", "Tanggal", "Status", "Subtotal (Rp)", "PPN perkiraan (Rp)", "PPh 23 perkiraan (Rp)", "Net perkiraan (Rp)", "Catatan"],
      ...data.versions.flatMap((v) => {
        const doc = data.docs.find((d) => d.id === v.docId);
        const bid = doc && data.bids.find((b) => b.id === doc.bidId);
        if (!doc || !bid) return [];
        return [[csvText(scopeName(bid.scopeId)), csvText(vendorName(bid.vendorId)), doc.kind === "quote" ? "Penawaran" : csvText(`Tambahan: ${doc.title}`), `v${v.number}`, v.docDate ?? "", VERSION_STATUSES[v.status as VersionStatusCode] ?? v.status, n(v.subtotal), n(v.ppn), n(v.pph23), n(v.subtotal + v.ppn - v.pph23), csvText(v.notes)]];
      }),
    ];
  }
  if (type === "invoices") {
    return [
      ["Lingkup", "Vendor", "Termin", "No.", "Jatuh tempo", "Subtotal (Rp)", "PPN perkiraan (Rp)", "PPh 23 perkiraan (Rp)", "Net perkiraan (Rp)", "Dibayar (Rp)", "Sisa (Rp)", "Status"],
      ...data.invoices.map((i) => {
        const st = invoiceState(i, data.payments.filter((p) => p.invoiceId === i.id));
        return [csvText(scopeName(i.scopeId)), csvText(vendorName(i.vendorId)), csvText(i.termin), csvText(i.ref), i.dueDate ?? "", n(i.subtotal), n(i.ppn), n(i.pph23), n(st.net), n(st.cash), n(st.remaining), INV_STATUS[i.status]];
      }),
    ];
  }
  if (type === "drives") {
    return [
      ["Rencana", "Tujuan", "Media", "Kapasitas (GB)", "Jumlah", "Harga satuan (Rp)", "Subtotal (Rp)", "Status", "Dibutuhkan sebelum"],
      ...data.allDriveLines.map((l) => [csvText(data.scenarios.find((s) => s.id === l.scenarioId)?.name ?? ""), PURPOSES[l.purpose], MEDIA[l.media], n(l.capacityGb), n(l.qty), n(l.unitPrice), n(lineAmount(l.qty * 1000, l.unitPrice)), DRIVE_STATUS[l.status], l.neededBy ?? ""]),
    ];
  }
  const cmp = buildComparison(data, data.scenarios.map((s) => s.id));
  return [
    ["Lingkup", "Budget (Rp)", ...cmp.scenarios.flatMap((s) => [csvText(`${s.name}: vendor`), csvText(`${s.name}: dipilih (Rp)`)])],
    ...cmp.scopes.map((s) => [csvText(s.name), n(s.budget), ...cmp.scenarios.flatMap((v) => [csvText(v.cells[s.id]?.vendor ?? ""), n(v.cells[s.id]?.amount ?? 0)])]),
    ["Hard drive", "", ...cmp.scenarios.flatMap((v) => ["", n(v.drives)])],
    ["Total", n(cmp.scenarios[0]?.total.budget ?? 0), ...cmp.scenarios.flatMap((v) => ["", n(v.total.chosen)])],
  ];
}
