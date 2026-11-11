"use server";
// Server functions called directly from the interactive timeline board.
// They return a result instead of redirecting so the board can toast and undo.

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import type { Db } from "@/db/client";
import { requireUser } from "@/lib/auth/session";
import * as sch from "@/lib/schedule/service";
import { getProjectForUser } from "@/lib/services";
import { isExpected } from "./action-helpers";

type Fail = { ok: false; error: string };

async function run<T extends object>(slug: string, fn: (db: Db, userId: string, projectId: string) => Promise<T>): Promise<({ ok: true } & T) | Fail> {
  const user = await requireUser();
  const db = await getDb();
  const row = await getProjectForUser(db, user.id, slug);
  if (!row) return { ok: false, error: "Project tidak ditemukan." };
  try {
    const result = await fn(db, user.id, row.project.id);
    revalidatePath(`/admin/p/${slug}`, "layout");
    return { ok: true, ...result };
  } catch (e) {
    if (!isExpected(e)) throw e;
    return { ok: false, error: e.message };
  }
}

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
