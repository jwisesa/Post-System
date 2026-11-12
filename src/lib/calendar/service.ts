import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { calendarTokens, projectMembers, projects } from "@/db/schema";
import { deliverableStatus } from "../deliverables/catalog";
import type { Deliverable } from "../deliverables/service";
import { listDeliverables } from "../deliverables/service";
import type { Schedule } from "../schedule/service";
import { getSchedule } from "../schedule/service";
import { statusLabel } from "../schedule/templates";
import { getViewerData, record, requireRole } from "../services";
import type { IcsEvent } from "./ics";

const newToken = () => randomBytes(24).toString("base64url");

export async function getOrCreateCalendarToken(db: Db, userId: string, projectId: string): Promise<string> {
  await requireRole(db, userId, projectId, "project.view");
  const active = and(eq(calendarTokens.projectId, projectId), eq(calendarTokens.userId, userId), isNull(calendarTokens.revokedAt));
  const [existing] = await db.select().from(calendarTokens).where(active).orderBy(desc(calendarTokens.createdAt)).limit(1);
  if (existing) return existing.token;
  const [created] = await db.insert(calendarTokens).values({ projectId, userId, token: newToken() }).returning();
  return created.token;
}

export async function regenerateCalendarToken(db: Db, userId: string, projectId: string): Promise<string> {
  await requireRole(db, userId, projectId, "project.view");
  return db.transaction(async (tx) => {
    await tx
      .update(calendarTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(calendarTokens.projectId, projectId), eq(calendarTokens.userId, userId), isNull(calendarTokens.revokedAt)));
    const [created] = await tx.insert(calendarTokens).values({ projectId, userId, token: newToken() }).returning();
    await record(tx, { projectId, userId, entity: "calendar_token", entityId: created.id, action: "update", summary: "Membuat ulang link kalender" });
    return created.token;
  });
}

export type Feed = { projectName: string; events: IcsEvent[] };

function buildEvents(schedule: Schedule, delivs: Deliverable[]): IcsEvent[] {
  const items = schedule.tracks.flatMap((t) =>
    t.items.map((i): IcsEvent => ({
      uid: `item-${i.id}@post-system`,
      date: i.dueDate,
      summary: `${i.hardDeadline ? "⚑ " : ""}${t.name}: ${i.name}`,
      description: `Status: ${statusLabel(i.status)}${i.picName ? `\nPIC: ${i.picName}` : ""}`,
    })),
  );
  const out = delivs
    .filter((d) => d.origin === "delivered" && d.dueDate)
    .map((d): IcsEvent => ({
      uid: `deliverable-${d.id}@post-system`,
      date: d.dueDate!,
      summary: `Deliver: ${d.name}${d.platform ? ` (${d.platform})` : ""}`,
      description: `Status: ${deliverableStatus(d.status).label}`,
    }));
  return [...items, ...out];
}

/** Null for unknown or revoked tokens, or when the user lost access to the project. Includes internal items. */
export async function getAdminFeed(db: Db, token: string): Promise<Feed | null> {
  const [row] = await db
    .select({ project: projects })
    .from(calendarTokens)
    .innerJoin(projects, eq(projects.id, calendarTokens.projectId))
    .innerJoin(projectMembers, and(eq(projectMembers.projectId, calendarTokens.projectId), eq(projectMembers.userId, calendarTokens.userId)))
    .where(and(eq(calendarTokens.token, token), isNull(calendarTokens.revokedAt)));
  if (!row) return null;
  const [schedule, delivs] = await Promise.all([
    getSchedule(db, row.project.id, { includeInternal: true }),
    listDeliverables(db, row.project.id, { includeInternal: true }),
  ]);
  return { projectName: row.project.name, events: buildEvents(schedule, delivs) };
}

/** Null for unknown or revoked share links. Internal items are never included. */
export async function getViewerFeed(db: Db, shareToken: string): Promise<Feed | null> {
  const data = await getViewerData(db, shareToken);
  if (!data) return null;
  return { projectName: data.project.name, events: buildEvents(data.schedule, data.deliverables) };
}
