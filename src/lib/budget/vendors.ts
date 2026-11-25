// Vendor comparison for one scope, pure. Values are PRE-TAX (quote + approved change orders), like the rollup.
import { bidValue, type BudgetRows, type BidValue } from "./rollup";

export type VendorRowIn = { bidId: string; vendor: string };
export type VendorCmp = {
  bidId: string; vendor: string; value: number; state: BidValue["state"]; cancelled: boolean; chosen: boolean;
  vsBudget: number | null; vsCheapest: number | null; cheapest: boolean; stage: "disetujui" | "masuk" | null; versions: number; lastStatus: string | null; latestVersionId: string | null;
};

/** vsBudget = budget - value (negative = over). vsCheapest = value - cheapest (0 for the cheapest). Bids without any quote have null. */
export function compareBids(scopeId: string, d: BudgetRows, names: Map<string, string>): VendorCmp[] {
  const budget = d.scopes.find((s) => s.id === scopeId)?.budget ?? 0;
  const pick = d.picks.find((p) => p.scopeId === scopeId);
  const base = d.bids.filter((b) => b.scopeId === scopeId).map((b) => {
    const bv = bidValue(b.id, d, pick?.bidId === b.id ? pick.versionId : null);
    const doc = d.docs.find((x) => x.bidId === b.id && x.kind === "quote");
    const vs = doc ? d.versions.filter((v) => v.docId === doc.id).sort((a, c) => a.number - c.number) : [];
    return { b, bv, vs, value: bv.quote + bv.changeOrders };
  });
  const priced = base.filter((x) => x.bv.state !== "none").map((x) => x.value);
  const min = priced.length ? Math.min(...priced) : null;
  return base.map(({ b, bv, vs, value }) => ({
    bidId: b.id, vendor: names.get(b.id) ?? "—", value, state: bv.state, cancelled: !!bv.cancelled, chosen: pick?.bidId === b.id,
    vsBudget: bv.state === "none" ? null : budget - value,
    vsCheapest: bv.state === "none" || min == null ? null : value - min,
    cheapest: bv.state !== "none" && value === min,
    stage: pick?.bidId !== b.id ? null : (vs.find((v) => v.id === bv.versionId)?.status === "approved" ? "disetujui" : "masuk"),
    versions: vs.length, lastStatus: vs.at(-1)?.status ?? null, latestVersionId: vs.at(-1)?.id ?? null,
  }));
}
