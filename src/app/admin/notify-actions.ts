"use server";

import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/session";
import { markAllRead } from "@/lib/push/service";

/** Own inbox only, so no project role applies. */
export async function markReadAction(kind?: "check") {
  const user = await requireUser();
  await markAllRead(await getDb(), user.id, kind === "check" ? "check" : undefined);
}
