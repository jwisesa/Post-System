"use server";
// Server functions for the template panel; they return a result so the panel can show errors inline.

import * as tpl from "@/lib/schedule/template-service";
import { runForClient as run } from "./action-helpers";

export async function previewTemplateAction(slug: string, source: tpl.TemplateSource, releaseDate: string) {
  return run(slug, async (db, userId, projectId) => ({ preview: await tpl.previewTemplate(db, userId, projectId, { source, releaseDate }) }));
}

export async function applyTemplateAction(slug: string, source: tpl.TemplateSource, releaseDate: string, compress: boolean, createGroups: boolean) {
  return run(slug, async (db, userId, projectId) => tpl.applyTemplate(db, userId, projectId, { source, releaseDate, compress, createGroups }));
}

export async function saveTemplateAction(slug: string, name: string, trackIds: string[]) {
  return run(slug, async (db, userId, projectId) => {
    await tpl.saveTemplateFromProject(db, userId, projectId, { name, trackIds });
    return {};
  });
}

export async function renameTemplateAction(slug: string, id: string, name: string) {
  return run(slug, async (db, userId) => {
    await tpl.renameTemplate(db, userId, id, name);
    return {};
  });
}

export async function deleteTemplateAction(slug: string, id: string) {
  return run(slug, async (db, userId) => {
    await tpl.deleteTemplate(db, userId, id);
    return {};
  });
}
