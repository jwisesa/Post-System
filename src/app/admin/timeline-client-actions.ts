"use server";
// Server functions called directly from the interactive timeline board.
// They return a result instead of redirecting so the board can toast and undo.

import * as sch from "@/lib/schedule/service";
import { runForClient as run } from "./action-helpers";

/** Sets exact dates on items: a drag, a multi-move, an undo or a redo. The board computed them. */
export async function moveItems(slug: string, moves: sch.DateMove[], summary: string) {
  return run(slug, async (db, userId, projectId) => {
    await sch.applyMoves(db, userId, projectId, moves, summary);
    return {};
  });
}

export async function patchItems(slug: string, itemIds: string[], patch: { status?: string; color?: number | null }) {
  return run(slug, async (db, userId, projectId) => {
    await sch.updateItems(db, userId, projectId, itemIds, patch);
    return {};
  });
}

export async function removeItems(slug: string, itemIds: string[]) {
  return run(slug, async (db, userId, projectId) => {
    await sch.deleteItems(db, userId, projectId, itemIds);
    return {};
  });
}

export async function setCascade(slug: string, cascade: boolean) {
  return run(slug, async (db, userId, projectId) => {
    const { settings } = await sch.getSchedule(db, projectId, { includeInternal: true });
    await sch.updateScheduleSettings(db, userId, projectId, { ...settings, cascade });
    return {};
  });
}

export async function quickStatus(slug: string, itemId: string, status: string) {
  return run(slug, async (db, userId, projectId) => {
    await sch.setItemStatus(db, userId, projectId, itemId, { status });
    return {};
  });
}

export async function linkItems(slug: string, itemId: string, dependsOnId: string) {
  return run(slug, async (db, userId, projectId) => {
    await sch.addDependency(db, userId, projectId, itemId, dependsOnId);
    return {};
  });
}

export async function unlinkItems(slug: string, itemId: string, dependsOnId: string) {
  return run(slug, async (db, userId, projectId) => {
    await sch.removeDependency(db, userId, projectId, itemId, dependsOnId);
    return {};
  });
}
