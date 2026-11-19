"use server";
// Script analysis. Called from the Naskah page; return results for toasts.

import * as sc from "@/lib/script/service";
import { runForClient as run } from "./action-helpers";

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
