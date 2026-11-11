"use server";
// Server functions called directly from the interactive timeline board.
// They return a result instead of redirecting so the board can toast and undo.

import * as sch from "@/lib/schedule/service";
import { runForClient as run } from "./action-helpers";

export async function shiftItem(slug: string, itemId: string, startDate: string, dueDate: string, cascade: boolean, reason: string) {
  return run(slug, async (db, userId, projectId) => {
    const { moves, conflicts } = await sch.applyShift(db, userId, projectId, itemId, { startDate, dueDate, cascade }, reason);
    return { undo: moves.map((m) => ({ id: m.id, startDate: m.oldStart, dueDate: m.oldDue })), conflicts };
  });
}

export async function undoShift(slug: string, moves: sch.DateMove[]) {
  return run(slug, async (db, userId, projectId) => {
    await sch.applyMoves(db, userId, projectId, moves, "Mengurungkan perubahan jadwal");
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
