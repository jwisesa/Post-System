"use server";
// Anggaran & Vendor. Amounts arrive as integers; the service re-validates everything.

import * as b from "@/lib/budget/service";
import { runForClient as run } from "./action-helpers";

export async function saveVendor(slug: string, id: string | null, input: b.VendorInput) {
  return run(slug, (db, u, p) => (id ? b.updateVendor(db, u, p, id, input).then(() => ({})) : b.createVendor(db, u, p, input).then(() => ({}))));
}
export async function archiveVendor(slug: string, id: string, archived: boolean) {
  return run(slug, (db, u, p) => b.setVendorArchived(db, u, p, id, archived).then(() => ({})));
}
export async function removeVendor(slug: string, id: string) {
  return run(slug, (db, u, p) => b.deleteVendor(db, u, p, id).then(() => ({})));
}
export async function saveScope(slug: string, id: string | null, input: b.ScopeInput) {
  return run(slug, (db, u, p) => (id ? b.updateScope(db, u, p, id, input).then(() => ({})) : b.createScope(db, u, p, input)));
}
export async function removeScope(slug: string, id: string) {
  return run(slug, (db, u, p) => b.deleteScope(db, u, p, id).then(() => ({})));
}
export async function addScopeBid(slug: string, scopeId: string, vendorId: string) {
  return run(slug, (db, u, p) => b.addBid(db, u, p, scopeId, vendorId).then(() => ({})));
}
export async function removeBid(slug: string, bidId: string) {
  return run(slug, (db, u, p) => b.deleteBid(db, u, p, bidId).then(() => ({})));
}
export async function saveVersion(slug: string, docId: string, input: b.VersionInput) {
  return run(slug, (db, u, p) => b.addVersion(db, u, p, docId, input));
}
export async function changeVersionStatus(slug: string, versionId: string, status: string, note: string) {
  return run(slug, (db, u, p) => b.setVersionStatus(db, u, p, versionId, status, note));
}
export async function chooseBid(slug: string, scopeId: string, bidId: string | null) {
  return run(slug, (db, u, p) => b.pickBid(db, u, p, scopeId, bidId).then(() => ({})));
}
