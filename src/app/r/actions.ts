"use server";
// Public endpoints for reviewer links. Each call re-checks token, assignment and visibility in the service,
// and throws when any of them fails (the page treats a throw as "link no longer valid").

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { signoffViaLink, submitReviewerFeedback } from "@/lib/review/service";

export async function reviewerAddFeedback(token: string, itemId: string, text: string) {
  const n = await submitReviewerFeedback(await getDb(), String(token), String(itemId), String(text));
  revalidatePath(`/r/${token}`);
  return n;
}

export async function reviewerSignoff(token: string, itemId: string, note: string) {
  await signoffViaLink(await getDb(), String(token), String(itemId), String(note ?? ""));
  revalidatePath(`/r/${token}`);
}
