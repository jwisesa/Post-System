import type { Db } from "@/db/client";
import { listDeliverables } from "../deliverables/service";
import { getSchedule } from "../schedule/service";
import { getTechSpec } from "../services";
import { runChecks } from "./rules";

export async function getChecks(db: Db, projectId: string, slug: string, today: string) {
  const [tech, deliverables, schedule] = await Promise.all([
    getTechSpec(db, projectId), listDeliverables(db, projectId, { includeInternal: true }), getSchedule(db, projectId, { includeInternal: true }),
  ]);
  return runChecks({
    slug, today, tech: tech as Record<string, string>, deliverables,
    items: schedule.tracks.flatMap((t) => t.items.map((x) => ({ id: x.id, name: x.name, trackId: t.id, trackName: t.name, parentId: x.parentId, dueDate: x.dueDate }))),
  });
}
