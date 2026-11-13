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
    sch.addItem(db, user.id, project.id, { trackId: str(f, "trackId"), parentId: str(f, "parentId") || null, name: str(f, "name"), startDate: str(f, "startDate"), dueDate: str(f, "dueDate"), color: Number(str(f, "color")) || null, workHours: Number(str(f, "workHours")) || null }),
  );
}

/** Saves details, status and dates. Dependents move only when the form's "cascade" box is ticked. */
export async function updateItemAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  const itemId = str(f, "itemId");
  const dates = { startDate: str(f, "startDate"), dueDate: str(f, "dueDate") };
  let target = timeline(project.slug);
  try {
    await sch.updateItemDetails(db, user.id, project.id, itemId, {
      name: str(f, "name"), picContactId: str(f, "picContactId") || null, hardDeadline: flag(f, "hardDeadline"), internal: flag(f, "internal"), color: Number(str(f, "color")) || null, workHours: Number(str(f, "workHours")) || null,
    });
    await sch.setItemStatus(db, user.id, project.id, itemId, { status: str(f, "status"), notes: str(f, "notes") });
    await sch.applyShift(db, user.id, project.id, itemId, { ...dates, cascade: flag(f, "cascade") }, str(f, "reason"));
  } catch (e) {
    if (!isExpected(e)) throw e;
    target = `${target}?error=${encodeURIComponent(e.message)}`;
  }
  revalidatePath(timeline(project.slug));
  redirect(target);
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

export async function saveSettingsAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(timeline(project.slug), async () => {
    let holidays: { date: string; name: string }[] = [];
    try { holidays = JSON.parse(str(f, "holidays") || "[]"); } catch { /* keep none */ }
    await sch.updateScheduleSettings(db, user.id, project.id, { skipWeekends: flag(f, "skipWeekends"), cascade: flag(f, "cascade"), national: flag(f, "national"), jointLeave: flag(f, "jointLeave"), hoursPerDay: Number(str(f, "hoursPerDay")) || undefined, holidays: Array.isArray(holidays) ? holidays : [] });
  });
}

export async function saveVersionAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(timeline(project.slug), () => sch.saveVersion(db, user.id, project.id, str(f, "name")));
}

export async function restoreVersionAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(timeline(project.slug), () => sch.restoreVersion(db, user.id, project.id, str(f, "versionId")));
}

export async function deleteVersionAction(f: FormData) {
  const { db, user, project } = await ctx(f);
  await finish(timeline(project.slug), () => sch.deleteVersion(db, user.id, project.id, str(f, "versionId")));
}
