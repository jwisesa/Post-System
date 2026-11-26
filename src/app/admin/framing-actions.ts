"use server";
// Server functions for saved framing charts; they return a result so the tool can show errors inline.

import * as fr from "@/lib/framing/service";
import { runForClient as run } from "./action-helpers";

export async function saveFramingChartAction(slug: string, id: string | null, name: string | null, state: Record<string, string>) {
  return run(slug, async (db, userId, projectId) => fr.saveChart(db, userId, projectId, { id, name: name ?? undefined, state }));
}
export async function renameFramingChartAction(slug: string, id: string, name: string) {
  return run(slug, async (db, userId, projectId) => { await fr.renameChart(db, userId, projectId, id, name); return {}; });
}
export async function deleteFramingChartAction(slug: string, id: string) {
  return run(slug, async (db, userId, projectId) => { await fr.deleteChart(db, userId, projectId, id); return {}; });
}
export async function duplicateFramingChartAction(slug: string, id: string) {
  return run(slug, async (db, userId, projectId) => fr.duplicateChart(db, userId, projectId, id));
}
export async function listFramingChartsAction(slug: string) {
  return run(slug, async (db, _u, projectId) => ({ charts: (await fr.listCharts(db, projectId)).map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() })) }));
}
