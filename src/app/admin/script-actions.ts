"use server";
// Script analysis. Called from the Naskah page; return results for toasts.

import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/session";
import * as sc from "@/lib/script/service";
import { getProjectForUser } from "@/lib/services";
import { runForClient as run } from "./action-helpers";

/** Read-only, any project member. No revalidation, so switching scenes never refreshes the page. */
async function read<T extends object>(slug: string, fn: (db: Awaited<ReturnType<typeof getDb>>, projectId: string) => Promise<T>) {
  const user = await requireUser();
  const db = await getDb();
  const row = await getProjectForUser(db, user.id, slug);
  if (!row) return { ok: false as const, error: "Project tidak ditemukan." };
  return { ok: true as const, ...(await fn(db, row.project.id)) };
}

export async function readSceneText(slug: string, sceneId: string) {
  return read(slug, async (db, projectId) => ({ blocks: await sc.getSceneText(db, projectId, sceneId) }));
}

export async function searchScriptText(slug: string, scriptId: string, query: string) {
  return read(slug, async (db, projectId) => ({ hits: await sc.searchScript(db, projectId, scriptId, query) }));
}

export async function purgeScriptText(slug: string, scriptId: string) {
  return run(slug, (db, userId, projectId) => sc.purgeScriptText(db, userId, projectId, scriptId).then(() => ({})));
}

export async function tagFromSelection(slug: string, sceneId: string, kind: string, excerpt: string, note: string, itemId?: string | null) {
  return run(slug, (db, userId, projectId) => sc.addTagFromSelection(db, userId, projectId, sceneId, kind, excerpt, note, itemId).then(() => ({})));
}

export async function saveScript(slug: string, input: sc.ImportInput) {
  return run(slug, (db, userId, projectId) => sc.importScript(db, userId, projectId, input));
}

export async function updateScene(slug: string, id: string, patch: sc.ScenePatch) {
  return run(slug, (db, userId, projectId) => sc.updateScene(db, userId, projectId, id, patch).then(() => ({})));
}

export async function deleteScene(slug: string, id: string) {
  return run(slug, (db, userId, projectId) => sc.deleteScene(db, userId, projectId, id).then(() => ({})));
}

export async function deleteScript(slug: string, id: string) {
  return run(slug, (db, userId, projectId) => sc.deleteScript(db, userId, projectId, id).then(() => ({})));
}

export async function setSceneTags(slug: string, ids: string[], input: { kind: string; note?: string; itemId?: string | null }) {
  return run(slug, (db, userId, projectId) => sc.setTags(db, userId, projectId, ids, input).then(() => ({})));
}

export async function confirmSceneTag(slug: string, id: string, kind: string) {
  return run(slug, (db, userId, projectId) => sc.confirmTag(db, userId, projectId, id, kind).then(() => ({})));
}

export async function removeSceneTag(slug: string, id: string, kind: string) {
  return run(slug, (db, userId, projectId) => sc.removeTag(db, userId, projectId, id, kind).then(() => ({})));
}

export async function createTagKind(slug: string, input: { label: string; color: number }) {
  return run(slug, (db, userId, projectId) => sc.createKind(db, userId, projectId, input));
}

export async function updateTagKind(slug: string, id: string, patch: { label?: string; color?: number }) {
  return run(slug, (db, userId, projectId) => sc.updateKind(db, userId, projectId, id, patch).then(() => ({})));
}

export async function moveTagKind(slug: string, id: string, dir: -1 | 1) {
  return run(slug, (db, userId, projectId) => sc.moveKind(db, userId, projectId, id, dir).then(() => ({})));
}

export async function deleteTagKind(slug: string, id: string) {
  return run(slug, (db, userId, projectId) => sc.deleteKind(db, userId, projectId, id));
}

export async function mergeScriptNames(slug: string, scriptId: string, kind: "character" | "location", names: string[], canonical: string) {
  return run(slug, (db, userId, projectId) => sc.mergeNames(db, userId, projectId, scriptId, kind, names, canonical).then(() => ({})));
}

export async function unmergeScriptName(slug: string, scriptId: string, kind: "character" | "location", fromName: string) {
  return run(slug, (db, userId, projectId) => sc.unmerge(db, userId, projectId, scriptId, kind, fromName).then(() => ({})));
}
