import { CANCEL_MARK } from "./catalog";
// The four numbers per scope: budget (target), chosen, invoiced, paid. All PRE-TAX.
// Takes plain rows so it runs on the server and in client components.

export type ScopeR = { id: string; budget: number };
export type BidR = { id: string; scopeId: string };
export type DocR = { id: string; bidId: string; kind: "quote" | "change_order" };
export type VersionR = { id: string; docId: string; number: number; status: string; subtotal: number; statusNote?: string };
export type PickR = { scopeId: string; bidId: string; versionId: string | null };
export type BudgetRows = { scopes: ScopeR[]; bids: BidR[]; docs: DocR[]; versions: VersionR[]; picks: PickR[]; invoices?: never[]; payments?: never[]; driveLines?: never[] }; // invoices/payments/driveLines arrive in phase B

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
  const drives = 0; // phase B/C: drive lines
  const chosen = bv ? bv.quote + bv.changeOrders + drives : 0;
  // invoiced / planned / paid / notInvoiced / unpaid come with invoices (phase B)
  return { scopeId, budget, chosen, state: bv?.state ?? "none", cancelled: !!bv?.cancelled, invoiced: 0, planned: 0, paid: 0, drives, variance: budget - chosen, overBudget: Math.max(0, chosen - budget), notInvoiced: 0, unpaid: 0 };
}
export type ScopeNumbers = ReturnType<typeof scopeNumbers>;

export function rollup(d: BudgetRows) {
  const rows = d.scopes.map((s) => scopeNumbers(s.id, d));
  const sum = (k: "budget" | "chosen" | "invoiced" | "paid" | "overBudget") => rows.reduce((n, r) => n + r[k], 0);
  return { rows, total: { budget: sum("budget"), chosen: sum("chosen"), invoiced: sum("invoiced"), paid: sum("paid"), overBudget: sum("overBudget"), provisional: rows.some((r) => r.state === "provisional") } };
}
