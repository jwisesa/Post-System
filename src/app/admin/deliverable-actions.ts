"use server";
// Deliverables. Called from the deliverables board; return results for toasts.

import * as d from "@/lib/deliverables/service";
import { runForClient as run } from "./action-helpers";

const done = async () => ({});

export async function applyPreset(slug: string, input: d.PresetInput) {
  return run(slug, (db, userId, projectId) => d.applyPreset(db, userId, projectId, input));
}

export async function generateCutdowns(slug: string, input: d.CutdownInput) {
  return run(slug, (db, userId, projectId) => d.generateCutdowns(db, userId, projectId, input));
}

export async function addDeliverable(slug: string, input: d.DeliverableInput) {
  return run(slug, (db, userId, projectId) => d.addDeliverable(db, userId, projectId, input).then(done));
}

export async function updateDeliverable(slug: string, id: string, input: d.DeliverableInput) {
  return run(slug, (db, userId, projectId) => d.updateDeliverable(db, userId, projectId, id, input).then(done));
}

export async function setDeliverableStatus(slug: string, id: string, status: string) {
  return run(slug, (db, userId, projectId) => d.setDeliverableStatus(db, userId, projectId, id, status).then(done));
}

export async function deleteDeliverables(slug: string, ids: string[]) {
  return run(slug, async (db, userId, projectId) => ({ count: await d.deleteDeliverables(db, userId, projectId, ids) }));
}
