"use server";
// Feedback points on milestones. Called from the item drawer; return results for toasts.

import * as f from "@/lib/feedback/service";
import { runForClient as run } from "./action-helpers";

export async function addFeedback(slug: string, itemId: string, text: string, fromWho: string) {
  return run(slug, async (db, userId, projectId) => ({ count: await f.addPoints(db, userId, projectId, itemId, { text, fromWho }) }));
}

export async function updateFeedback(slug: string, pointId: string, input: { body: string; ref: string; fromWho: string }) {
  return run(slug, async (db, userId, projectId) => { await f.updatePoint(db, userId, projectId, pointId, input); return {}; });
}

export async function deleteFeedback(slug: string, pointId: string) {
  return run(slug, async (db, userId, projectId) => { await f.deletePoint(db, userId, projectId, pointId); return {}; });
}

export async function checkFeedback(slug: string, pointId: string, status: string, checkedItemId: string, note: string) {
  return run(slug, async (db, userId, projectId) => { await f.checkPoint(db, userId, projectId, pointId, { status, checkedItemId, note }); return {}; });
}
