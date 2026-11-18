"use server";
// Sign-offs recorded or revoked by the team, from the item drawer.

import * as rv from "@/lib/review/service";
import { runForClient as run } from "./action-helpers";

export async function recordSignoffAction(slug: string, itemId: string, input: { signerName: string; signerRole: string; note: string; evidenceUrl: string }) {
  return run(slug, async (db, userId, projectId) => { await rv.recordSignoff(db, userId, projectId, itemId, input); return {}; });
}

export async function revokeSignoffAction(slug: string, signoffId: string, reason: string) {
  return run(slug, async (db, userId, projectId) => { await rv.revokeSignoff(db, userId, projectId, signoffId, reason); return {}; });
}
