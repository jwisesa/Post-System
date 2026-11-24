// Server-side shaping of invoice rows for the client components (plain data, no money math here).
import type { budgetInvoices, budgetPayments } from "@/db/schema";
import type { InvoiceRow } from "@/components/budget/InvoiceParts";

type Inv = typeof budgetInvoices.$inferSelect;
type Pay = typeof budgetPayments.$inferSelect;

export const jakartaToday = () => new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });

export function invoiceRow(i: Inv, payments: Pay[], scope: string, vendor: string, vendorIsChosen: boolean): InvoiceRow {
  return {
    id: i.id, scopeId: i.scopeId, scope, vendorId: i.vendorId, vendor, docId: i.docId, termin: i.termin, ref: i.ref, issueDate: i.issueDate, dueDate: i.dueDate,
    subtotal: i.subtotal, ppnRateBp: i.ppnRateBp, ppn: i.ppn, pph23RateBp: i.pph23RateBp, pph23: i.pph23, status: i.status, links: i.links, notes: i.notes,
    offChosen: !vendorIsChosen, payments: payments.filter((p) => p.invoiceId === i.id).map((p) => ({ id: p.id, paidOn: p.paidOn, amount: p.amount, note: p.note, link: p.link })),
  };
}
