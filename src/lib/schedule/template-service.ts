// Account-owned timeline templates (structure only) and backward planning onto a project.
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { dependencies, projects, scheduleItems, scheduleTemplates, scheduleVersions, teamContacts, teamGroups, tracks } from "@/db/schema";
import { InputError, record, requireRole, type Tx } from "../services";
import { defFromSchedule, fromBuiltin, parseTemplateDef, planBackward, type Plan, type TemplateDef } from "./backward";
import { fmtDate, isDate, today } from "./dates";
import { snapshot } from "./service";
import { TRACK_TEMPLATES } from "./templates";
import { calOf } from "./workdays";

export type TemplateSource = { kind: "builtin"; value: string } | { kind: "saved"; id: string };

const notFound = () => new InputError("Template tidak ditemukan.");
const cleanName = (n: string) => {
  const name = n.trim().slice(0, 120);
  if (!name) throw new InputError("Nama template wajib diisi.");
  return name;
};

// ---------- the user's own templates ----------

export async function listTemplates(db: Db, userId: string) {
  const rows = await db.select().from(scheduleTemplates).where(eq(scheduleTemplates.ownerId, userId)).orderBy(desc(scheduleTemplates.updatedAt));
  return rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt, tracks: r.data.tracks.length, phases: r.data.tracks.reduce((n, t) => n + t.phases.length, 0) }));
}

export type TemplateRow = Awaited<ReturnType<typeof listTemplates>>[number];

// Not audited: audit_log needs a project, and a template belongs to the account.
export async function deleteTemplate(db: Db, userId: string, id: string) {
  const gone = await db.delete(scheduleTemplates).where(and(eq(scheduleTemplates.id, id), eq(scheduleTemplates.ownerId, userId))).returning({ id: scheduleTemplates.id });
  if (!gone.length) throw notFound();
}

export async function renameTemplate(db: Db, userId: string, id: string, name: string) {
  const done = await db.update(scheduleTemplates).set({ name: cleanName(name), updatedAt: new Date() }).where(and(eq(scheduleTemplates.id, id), eq(scheduleTemplates.ownerId, userId))).returning({ id: scheduleTemplates.id });
  if (!done.length) throw notFound();
}

/** Turns selected tracks of the project into a template. Dates, status and individual PICs are not stored. */
export async function saveTemplateFromProject(db: Db, userId: string, projectId: string, input: { name: string; trackIds: string[] }) {
  await requireRole(db, userId, projectId, "schedule.edit");
  const name = cleanName(input.name);
  return db.transaction(async (tx) => {
    const [project] = await tx.select({ settings: projects.scheduleSettings }).from(projects).where(eq(projects.id, projectId));
    const picked = input.trackIds.length ? await tx.select({ id: tracks.id, name: tracks.name, sortOrder: tracks.sortOrder }).from(tracks).where(and(eq(tracks.projectId, projectId), inArray(tracks.id, input.trackIds))) : [];
    if (!picked.length) throw new InputError("Pilih minimal satu track.");
    picked.sort((a, b) => a.sortOrder - b.sortOrder);
    const items = await tx.select().from(scheduleItems).where(eq(scheduleItems.projectId, projectId));
    const deps = items.length ? await tx.select().from(dependencies).where(inArray(dependencies.itemId, items.map((i) => i.id))) : [];
    const groups = new Map((await tx.select({ id: teamGroups.id, name: teamGroups.name }).from(teamGroups).where(eq(teamGroups.projectId, projectId))).map((g) => [g.id, g.name]));
    const contactGroup = new Map((await tx.select({ id: teamContacts.id, groupId: teamContacts.groupId }).from(teamContacts).where(eq(teamContacts.projectId, projectId))).map((c) => [c.id, groups.get(c.groupId)]));
    const groupOf = (i: { picGroupId: string | null; picContactId: string | null }) => (i.picGroupId ? groups.get(i.picGroupId) : i.picContactId ? contactGroup.get(i.picContactId) : undefined);
    const data = parseTemplateDef(defFromSchedule(picked, items, deps, groupOf, calOf(project?.settings)));
    if (!data.tracks.some((t) => t.phases.length)) throw new InputError("Track yang dipilih belum punya fase.");
    const [t] = await tx.insert(scheduleTemplates).values({ ownerId: userId, name, data }).returning({ id: scheduleTemplates.id });
    await record(tx, { projectId, userId, entity: "schedule_template", entityId: t.id, action: "create", summary: `Menyimpan template "${name}" dari ${picked.length} track` });
    return t.id;
  });
}

// ---------- planning ----------

async function resolve(tx: Tx | Db, userId: string, projectId: string, source: TemplateSource, releaseDate: string) {
  if (!isDate(releaseDate)) throw new InputError("Tanggal rilis wajib diisi.");
  const [project] = await tx.select({ settings: projects.scheduleSettings }).from(projects).where(eq(projects.id, projectId));
  const cal = calOf(project?.settings);
  let name: string, def: TemplateDef;
  if (source.kind === "builtin") {
    const t = TRACK_TEMPLATES.find((x) => x.value === source.value);
    if (!t) throw notFound();
    [name, def] = [t.label, fromBuiltin(t, cal)];
  } else {
    const [row] = await tx.select().from(scheduleTemplates).where(and(eq(scheduleTemplates.id, source.id), eq(scheduleTemplates.ownerId, userId)));
    if (!row) throw notFound();
    [name, def] = [row.name, parseTemplateDef(row.data)];
  }
  if (!def.tracks.some((t) => t.phases.length)) throw new InputError("Template ini tidak punya fase.");
  return { name, def, plan: planBackward(def, releaseDate, cal, today()) };
}

const planGroups = (plan: Plan) => [...new Map(plan.phases.flatMap((p) => [p.group, ...p.milestones.map((m) => m.group)]).filter((g): g is string => !!g).map((g) => [g.toLowerCase(), g])).values()];
const keyOfGroup = (n: string) => n.trim().toLowerCase();

export async function previewTemplate(db: Db, userId: string, projectId: string, input: { source: TemplateSource; releaseDate: string }) {
  await requireRole(db, userId, projectId, "schedule.edit");
  const { plan, def } = await resolve(db, userId, projectId, input.source, input.releaseDate);
  const have = new Set((await db.select({ name: teamGroups.name }).from(teamGroups).where(eq(teamGroups.projectId, projectId))).map((g) => keyOfGroup(g.name)));
  const existing = await db.select({ id: scheduleItems.id }).from(scheduleItems).where(eq(scheduleItems.projectId, projectId));
  return { plan, trackNames: def.tracks.map((t) => t.name), groups: planGroups(plan).map((name) => ({ name, found: have.has(keyOfGroup(name)) })), existingItems: existing.length };
}

/** Adds the template's tracks to the project. The plan is recomputed here; existing items are never touched. */
export async function applyTemplate(db: Db, userId: string, projectId: string, input: { source: TemplateSource; releaseDate: string; compress: boolean; createGroups: boolean }) {
  await requireRole(db, userId, projectId, "schedule.edit");
  return db.transaction(async (tx) => {
    const { name, def, plan: full } = await resolve(tx, userId, projectId, input.source, input.releaseDate);
    const plan = input.compress && full.suggestion?.fits ? { ...full, phases: full.suggestion.phases } : full;
    await tx.insert(scheduleVersions).values({ projectId, name: `Sebelum template "${name}"`, snapshot: await snapshot(tx, projectId), createdBy: userId });

    const groupIds = new Map((await tx.select().from(teamGroups).where(eq(teamGroups.projectId, projectId))).map((g) => [keyOfGroup(g.name), g.id]));
    if (input.createGroups) {
      for (const g of planGroups(plan)) {
        if (groupIds.has(keyOfGroup(g))) continue;
        const [row] = await tx.insert(teamGroups).values({ projectId, name: g.trim(), sortOrder: 999 }).returning({ id: teamGroups.id });
        groupIds.set(keyOfGroup(g), row.id);
      }
    }
    const gid = (n?: string) => (n ? (groupIds.get(keyOfGroup(n)) ?? null) : null);

    const made = await tx.insert(tracks).values(def.tracks.map((t, i) => ({ projectId, name: t.name, sortOrder: 999 + i }))).returning({ id: tracks.id });
    const flat = def.tracks.flatMap((t) => t.phases);
    const planned = new Map(plan.phases.map((p) => [p.key, p]));
    const phaseRows = plan.phases.length
      ? await tx.insert(scheduleItems).values(plan.phases.map((p) => ({
        projectId, trackId: made[p.track].id, name: p.name, color: p.color, startDate: p.start, dueDate: p.due, baselineStart: p.start, baselineDue: p.due,
        hardDeadline: p.hard, internal: p.internal, workHours: p.hours, picGroupId: gid(p.group),
      }))).returning({ id: scheduleItems.id })
      : [];
    const idOf = new Map(plan.phases.map((p, i) => [p.key, phaseRows[i].id]));
    const links = flat.flatMap((p) => planned.get(p.key)!.after.map((a) => ({ itemId: idOf.get(p.key)!, dependsOnId: idOf.get(a)! })));
    if (links.length) await tx.insert(dependencies).values(links);
    const stones = plan.phases.flatMap((p) => p.milestones.map((m) => ({
      projectId, trackId: made[p.track].id, parentId: idOf.get(p.key)!, name: m.name, startDate: m.date, dueDate: m.date, baselineStart: m.date, baselineDue: m.date, picGroupId: gid(m.group),
    })));
    if (stones.length) await tx.insert(scheduleItems).values(stones);
    await record(tx, { projectId, userId, entity: "schedule", entityId: projectId, action: "create", summary: `Menerapkan template "${name}" (rilis ${fmtDate(plan.release)}, ${plan.phases.length} fase)` });
    return { phases: plan.phases.length };
  });
}
