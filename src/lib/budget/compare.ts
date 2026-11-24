// Compare any two versions of a project (also across vendors). Reads need "budget.view"; foreign/invalid ids never resolve.
import type { Db } from "@/db/client";
import { InputError } from "../services";
import { diffVersions } from "./diff";
import { getBudget, getVersions } from "./service";

export type Side = { id: string; vendor: string; scope: string; number: number; status: string; docDate: string | null; ref: string; ppnRateBp: number | null; pph23RateBp: number | null; subtotal: number; ppn: number; pph23: number };

export async function compareVersions(db: Db, userId: string, projectId: string, aId: string, bId: string) {
  const [a, b] = await getVersions(db, userId, projectId, [aId, bId]); // throws Forbidden without budget.view
  if (!a || !b) throw new InputError("Versi tidak ditemukan di project ini.");
  const all = await getBudget(db, userId, projectId);
  const side = (v: NonNullable<typeof a>): Side => {
    const bid = all.bids.find((x) => x.id === all.docs.find((d) => d.id === v.docId)?.bidId);
    return { id: v.id, vendor: all.vendors.find((x) => x.id === bid?.vendorId)?.name ?? "—", scope: all.scopes.find((s) => s.id === bid?.scopeId)?.name ?? "—", number: v.number, status: v.status, docDate: v.docDate, ref: v.ref, ppnRateBp: v.ppnRateBp, pph23RateBp: v.pph23RateBp, subtotal: v.subtotal, ppn: v.ppn, pph23: v.pph23 };
  };
  return { a: side(a), b: side(b), diff: diffVersions(a, b), ratesDiffer: a.ppnRateBp !== b.ppnRateBp || a.pph23RateBp !== b.pph23RateBp };
}
