"use server";
// Links, versions and comments. Called from client components; return results for toasts.

import * as a from "@/lib/assets/service";
import { runForClient as run } from "./action-helpers";

const done = async () => ({});

export async function addAttachment(slug: string, input: a.NewAttachment) {
  return run(slug, (db, userId, projectId) => a.addAttachment(db, userId, projectId, input).then(done));
}

export async function addVersion(slug: string, attachmentId: string, url: string, notes: string) {
  return run(slug, async (db, userId, projectId) => ({ number: await a.addVersion(db, userId, projectId, attachmentId, { url, notes }) }));
}

export async function setVersionStatus(slug: string, versionId: string, status: string) {
  return run(slug, (db, userId, projectId) => a.setVersionStatus(db, userId, projectId, versionId, status).then(done));
}

export async function updateAttachment(slug: string, attachmentId: string, input: { label: string; kind: string; internal: boolean }) {
  return run(slug, (db, userId, projectId) => a.updateAttachment(db, userId, projectId, attachmentId, input).then(done));
}

export async function deleteAttachment(slug: string, attachmentId: string) {
  return run(slug, (db, userId, projectId) => a.deleteAttachment(db, userId, projectId, attachmentId).then(done));
}

export async function addComment(slug: string, targetType: string, targetId: string, body: string) {
  return run(slug, (db, userId, projectId) => a.addComment(db, userId, projectId, { targetType, targetId, body }).then(done));
}

export async function deleteComment(slug: string, commentId: string) {
  return run(slug, (db, userId, projectId) => a.deleteComment(db, userId, projectId, commentId).then(done));
}
