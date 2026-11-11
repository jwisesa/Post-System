"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as sch from "@/lib/schedule/service";
import { ctx, finish, flag, isExpected, str } from "./action-helpers";

const timeline = (slug: string) => `/admin/p/${slug}/timeline`;

export async function addTrackAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(timeline(project.slug), () => sch.addTrack(db, user.id, project.id, { name: str(f, "name"), template: str(f, "template"), startDate: str(f, "startDate") }));
}

export async function deleteTrackAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(timeline(project.slug), () => sch.deleteTrack(db, user.id, project.id, str(f, "trackId")));
}

export async function addItemAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(timeline(project.slug), () =>
    sch.addItem(db, user.id, project.id, { trackId: str(f, "trackId"), parentId: str(f, "parentId") || null, name: str(f, "name"), startDate: str(f, "startDate"), dueDate: str(f, "dueDate") }),
  );
}

/**
 * Saves details right away. A date change that would move or collide with
 * other items goes to the preview page first; a self-contained one is applied.
 */
export async function updateItemAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  const itemId = str(f, "itemId");
  const dates = { startDate: str(f, "startDate"), dueDate: str(f, "dueDate"), cascade: true };
  let target = timeline(project.slug);
  try {
    await sch.updateItemDetails(db, user.id, project.id, itemId, {
      name: str(f, "name"), picContactId: str(f, "picContactId") || null, hardDeadline: flag(f, "hardDeadline"), internal: flag(f, "internal"),
    });
    await sch.setItemStatus(db, user.id, project.id, itemId, { status: str(f, "status"), notes: str(f, "notes") });
    const preview = await sch.previewShift(db, user.id, project.id, itemId, dates);
    if (preview.moves.length > 1 || preview.conflicts.length) {
      const q = new URLSearchParams({ item: itemId, start: dates.startDate, due: dates.dueDate, reason: str(f, "reason") });
      target = `${target}/shift?${q}`;
    } else if (preview.moves.length) {
      await sch.applyShift(db, user.id, project.id, itemId, dates, str(f, "reason"));
    }
  } catch (e) {
    if (!isExpected(e)) throw e;
    target = `${target}?error=${encodeURIComponent(e.message)}`;
  }
  revalidatePath(timeline(project.slug));
  redirect(target);
}

export async function applyShiftAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(timeline(project.slug), () =>
    sch.applyShift(db, user.id, project.id, str(f, "itemId"), { startDate: str(f, "startDate"), dueDate: str(f, "dueDate"), cascade: str(f, "mode") !== "single" }, str(f, "reason")),
  );
}

export async function setStatusAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(timeline(project.slug), () => sch.setItemStatus(db, user.id, project.id, str(f, "itemId"), { status: str(f, "status"), notes: str(f, "notes") }));
}

export async function deleteItemAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(timeline(project.slug), () => sch.deleteItem(db, user.id, project.id, str(f, "itemId")));
}

export async function addDependencyAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(timeline(project.slug), () => sch.addDependency(db, user.id, project.id, str(f, "itemId"), str(f, "dependsOnId")));
}

export async function removeDependencyAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(timeline(project.slug), () => sch.removeDependency(db, user.id, project.id, str(f, "itemId"), str(f, "dependsOnId")));
}

export async function rebaselineAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(timeline(project.slug), () => sch.rebaseline(db, user.id, project.id, str(f, "reason")));
}
