"use server";
// Shot tracker. Called from the EDL tool page; return results for toasts.

import type { ShotInput } from "@/lib/edl/edl";
import * as sh from "@/lib/edl/service";
import { runForClient as run } from "./action-helpers";

export async function saveShots(slug: string, input: ShotInput[]) {
  return run(slug, (db, userId, projectId) => sh.saveShots(db, userId, projectId, input));
}

export async function updateShot(slug: string, id: string, patch: sh.ShotPatch) {
  return run(slug, (db, userId, projectId) => sh.updateShot(db, userId, projectId, id, patch).then(() => ({})));
}

export async function deleteShots(slug: string, ids: string[]) {
  return run(slug, async (db, userId, projectId) => ({ count: await sh.deleteShots(db, userId, projectId, ids) }));
}
