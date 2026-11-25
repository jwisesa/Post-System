import { CANCEL_MARK } from "./catalog";
import { lineAmount, paidPortion } from "./money";
// The four numbers per scope: budget (target), chosen, invoiced, paid. All PRE-TAX.
// Takes plain rows so it runs on the server and in client components.

export type ScopeR = { id: string; budget: number };
export type BidR = { id: string; scopeId: string };
export type DocR = { id: string; bidId: string; kind: "quote" | "change_order" };
export type VersionR = { id: string; docId: string; number: number; status: string; subtotal: number; statusNote?: string };
export type PickR = { scopeId: string; bidId: string; versionId: string | null };
export type InvoiceR = { id: string; scopeId: string; vendorId?: string; subtotal: number; ppn: number; pph23: number; status: string };
export type PaymentR = { invoiceId: string; amount: number };
export type DriveR = { scopeId: string; qty: number; unitPrice: number; status: string };
export type BudgetRows = { scopes: ScopeR[]; bids: BidR[]; docs: DocR[]; versions: VersionR[]; picks: PickR[]; invoices?: InvoiceR[]; payments?: PaymentR[]; driveLines?: DriveR[] };

/** One invoice against its payments. net = what is transferred; cash = payments so far; portion = pre-tax share covered (capped). */
export function invoiceState(inv: { subtotal: number; ppn: number; pph23: number }, pays: { amount: number }[]) {
  const net = inv.subtotal + inv.ppn - inv.pph23;
  const cash = pays.reduce((n, p) => n + p.amount, 0);
  return { net, cash, remaining: Math.max(0, net - cash), lunas: net > 0 && cash >= net, overpaid: Math.max(0, cash - net), portion: paidPortion(inv, cash) };
}

export type BidValue = { quote: number; state: "pinned" | "approved" | "provisional" | "none"; versionId?: string; changeOrders: number; cancelled?: boolean };

export function bidValue(bidId: string, d: BudgetRows, pinnedVersionId?: string | null): BidValue {
  const quoteDoc = d.docs.find((x) => x.bidId === bidId && x.kind === "quote");
  const vs = quoteDoc ? d.versions.filter((v) => v.docId === quoteDoc.id).sort((a, b) => b.number - a.number) : [];
  const coDocs = new Set(d.docs.filter((x) => x.bidId === bidId && x.kind === "change_order").map((x) => x.id));
  const changeOrders = d.versions.filter((v) => coDocs.has(v.docId) && v.status === "approved").reduce((n, v) => n + v.subtotal, 0);
  const pinned = pinnedVersionId ? vs.find((v) => v.id === pinnedVersionId) : undefined;
  if (pinned) return { quote: pinned.subtotal, state: "pinned", versionId: pinned.id, changeOrders };
  const ok = vs.find((v) => v.status === "approved");
  if (ok) return { quote: ok.subtotal, state: "approved", versionId: ok.id, changeOrders };
  const prov = vs.find((v) => v.status !== "rejected" && v.status !== "superseded");
  if (prov) return { quote: prov.subtotal, state: "provisional", versionId: prov.id, changeOrders, cancelled: !!prov.statusNote?.startsWith(CANCEL_MARK) };
  return { quote: 0, state: "none", changeOrders };
}

export function scopeNumbers(scopeId: string, d: BudgetRows) {
  const budget = d.scopes.find((s) => s.id === scopeId)?.budget ?? 0;
  const pick = d.picks.find((p) => p.scopeId === scopeId);
  const bv = pick ? bidValue(pick.bidId, d, pick.versionId) : null;
  const drives = (d.driveLines ?? []).filter((l) => l.scopeId === scopeId && l.status !== "cancelled").reduce((n, l) => n + lineAmount(l.qty * 1000, l.unitPrice), 0);
  const chosen = (bv ? bv.quote + bv.changeOrders : 0) + drives;
  let invoiced = 0, planned = 0, paid = 0, overpaid = 0;
  for (const i of (d.invoices ?? []).filter((x) => x.scopeId === scopeId)) {
    if (i.status === "planned") planned += i.subtotal;
    else if (i.status === "received") {
      const st = invoiceState(i, (d.payments ?? []).filter((p) => p.invoiceId === i.id));
      invoiced += i.subtotal; paid += st.portion; overpaid += st.overpaid;
    }
  }
  return { scopeId, budget, chosen, state: bv?.state ?? "none", cancelled: !!bv?.cancelled, invoiced, planned, paid, overpaid, drives, variance: budget - chosen, overBudget: Math.max(0, chosen - budget), notInvoiced: Math.max(0, chosen - invoiced), overInvoiced: Math.max(0, invoiced - chosen), unpaid: invoiced - paid };
}
export type ScopeNumbers = ReturnType<typeof scopeNumbers>;

export function rollup(d: BudgetRows) {
  const rows = d.scopes.map((s) => scopeNumbers(s.id, d));
  const sum = (k: "budget" | "chosen" | "invoiced" | "paid" | "overBudget" | "overpaid" | "overInvoiced") => rows.reduce((n, r) => n + r[k], 0);
  return { rows, total: { budget: sum("budget"), chosen: sum("chosen"), invoiced: sum("invoiced"), paid: sum("paid"), overBudget: sum("overBudget"), overpaid: sum("overpaid"), overInvoiced: sum("overInvoiced"), provisional: rows.some((r) => r.state === "provisional") } };
}
