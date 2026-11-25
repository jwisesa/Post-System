"use server";
// Anggaran & Vendor. Amounts arrive as integers; the service re-validates everything.

import * as d from "@/lib/budget/drives";
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
export async function saveChangeOrder(slug: string, bidId: string, title: string, input: b.VersionInput) {
  return run(slug, (db, u, p) => b.createChangeOrder(db, u, p, bidId, title, input).then((r) => ({ number: r.number })));
}
export async function saveInvoice(slug: string, id: string | null, input: b.InvoiceInput) {
  return run(slug, (db, u, p) => (id ? b.updateInvoice(db, u, p, id, input).then(() => ({})) : b.addInvoice(db, u, p, input).then(() => ({}))));
}
export async function removeInvoice(slug: string, id: string) {
  return run(slug, (db, u, p) => b.deleteInvoice(db, u, p, id).then(() => ({})));
}
export async function savePayment(slug: string, invoiceId: string, input: b.PaymentInput) {
  return run(slug, (db, u, p) => b.addPayment(db, u, p, invoiceId, input).then(() => ({})));
}
export async function removePayment(slug: string, id: string) {
  return run(slug, (db, u, p) => b.deletePayment(db, u, p, id).then(() => ({})));
}

// ---------- hard drive ----------
export async function saveCalc(slug: string, calc: unknown) {
  return run(slug, (db, u, p) => d.saveDriveCalc(db, u, p, calc).then(() => ({})));
}
export async function reseedCalc(slug: string) {
  return run(slug, (db, u, p) => d.reseedDriveCalc(db, u, p).then(() => ({})));
}
export async function saveRateTable(slug: string, rows: unknown) {
  return run(slug, (db, u, p) => d.saveRates(db, u, p, rows).then(() => ({})));
}
export async function saveDrive(slug: string, id: string | null, input: d.DriveLineInput) {
  return run(slug, (db, u, p) => (id ? d.updateDriveLine(db, u, p, id, input).then(() => ({})) : d.addDriveLine(db, u, p, input).then(() => ({}))));
}
export async function removeDrive(slug: string, id: string) {
  return run(slug, (db, u, p) => d.deleteDriveLine(db, u, p, id).then(() => ({})));
}
