"use server";
// Dashboard actions called from client components; return results for toasts.

import { regenerateCalendarToken } from "@/lib/calendar/service";
import { markFollowedUp as followUp } from "@/lib/schedule/service";
import { runForClient as run } from "./action-helpers";

export async function markFollowedUp(slug: string, itemId: string, note: string) {
  return run(slug, (db, userId, projectId) => followUp(db, userId, projectId, itemId, note).then(() => ({})));
}

export async function regenerateCalendarLink(slug: string) {
  return run(slug, async (db, userId, projectId) => ({ token: await regenerateCalendarToken(db, userId, projectId) }));
}
