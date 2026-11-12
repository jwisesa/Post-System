// All reads and writes go through here. Every mutation checks the caller's
// role and writes an audit_log row in the same transaction.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  auditLog,
  projectMembers,
  projects,
  shareLinks,
  teamContacts,
  teamGroups,
  techSpecs,
  users,
} from "@/db/schema";
import { hashPassword } from "./auth/password";
import { assertCan, type Role } from "./auth/permissions";
import { DEFAULT_TEAM_GROUPS, defaultTechSpec, parseTechSpec, TECH_FIELDS } from "./tech-spec/schema";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class InputError extends Error {}

export type Change = {
  projectId: string;
  userId: string;
  entity: string;
  entityId: string;
  action: "create" | "update" | "delete";
  summary: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
};

export function record(tx: Tx, c: Change) {
  return tx.insert(auditLog).values({ ...c, reason: c.reason ?? "" });
}

function slugify(name: string): string {
  const s = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "project";
}

export async function getRole(db: Db, userId: string, projectId: string): Promise<Role | null> {
  const [m] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.projectId, projectId)));
  return m?.role ?? null;
}

export async function requireRole(db: Db, userId: string, projectId: string, action: Parameters<typeof assertCan>[1]) {
  assertCan(await getRole(db, userId, projectId), action);
}

// ---------- users ----------

export async function createUser(db: Db, input: { name: string; email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new InputError("Nama dan email wajib valid.");
  if (input.password.length < 8) throw new InputError("Password minimal 8 karakter.");
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new InputError("Email sudah terdaftar.");
  const [u] = await db
    .insert(users)
    .values({ name, email, passwordHash: await hashPassword(input.password) })
    .returning({ id: users.id, name: users.name, email: users.email });
  return u;
}

export async function hasAnyUser(db: Db): Promise<boolean> {
  return (await db.select({ id: users.id }).from(users).limit(1)).length > 0;
}

/**
 * One-time bootstrap for a fresh deployment: creates the first account when the
 * users table is empty and the typed key matches SETUP_KEY. Disabled without a key.
 */
export async function createFirstAdmin(db: Db, setupKey: string | undefined, input: { key: string; name: string; email: string; password: string }) {
  if (!setupKey || (await hasAnyUser(db))) throw new InputError("Setup sudah tidak tersedia.");
  const digest = (v: string) => createHash("sha256").update(v).digest();
  if (!timingSafeEqual(digest(input.key), digest(setupKey))) throw new InputError("Setup key salah.");
  return createUser(db, input);
}

// ---------- projects ----------

export async function listProjects(db: Db, userId: string) {
  return db
    .select({ project: projects, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.userId, userId))
    .orderBy(asc(projects.name));
}

/** Null when the project does not exist OR the user is not a member. */
export async function getProjectForUser(db: Db, userId: string, slug: string) {
  const [row] = await db
    .select({ project: projects, role: projectMembers.role })
    .from(projects)
    .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(and(eq(projects.slug, slug), eq(projectMembers.userId, userId)));
  return row ?? null;
}

export type ProjectInput = { name: string; productionType: string; platforms: string[]; unitCount: number | null };

function cleanProject(input: ProjectInput): ProjectInput {
  const name = input.name.trim();
  if (!name) throw new InputError("Nama project wajib diisi.");
  const unitCount = input.unitCount && input.unitCount > 0 ? Math.floor(input.unitCount) : null;
  return { name, productionType: input.productionType, platforms: input.platforms, unitCount };
}

export async function createProject(db: Db, userId: string, input: ProjectInput) {
  const data = cleanProject(input);
  const base = slugify(data.name);
  return db.transaction(async (tx) => {
    let slug = base;
    for (let n = 2; (await tx.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug))).length; n++) {
      slug = `${base}-${n}`;
    }
    const [p] = await tx.insert(projects).values({ ...data, slug }).returning();
    await tx.insert(projectMembers).values({ projectId: p.id, userId, role: "supervisor" });
    await tx.insert(techSpecs).values({ projectId: p.id, data: defaultTechSpec(data.productionType) });
    await tx.insert(teamGroups).values(DEFAULT_TEAM_GROUPS.map((name, i) => ({ projectId: p.id, name, sortOrder: i })));
    await record(tx, { projectId: p.id, userId, entity: "project", entityId: p.id, action: "create", summary: `Membuat project "${p.name}"`, after: data });
    return p;
  });
}

export async function updateProject(db: Db, userId: string, projectId: string, input: ProjectInput) {
  await requireRole(db, userId, projectId, "project.edit");
  const data = cleanProject(input);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(projects).where(eq(projects.id, projectId));
    await tx.update(projects).set(data).where(eq(projects.id, projectId));
    await record(tx, {
      projectId, userId, entity: "project", entityId: projectId, action: "update", summary: "Mengubah info project",
      before: { name: before.name, productionType: before.productionType, platforms: before.platforms, unitCount: before.unitCount },
      after: data,
    });
  });
}

// ---------- technical page ----------

export async function getTechSpec(db: Db, projectId: string) {
  const [row] = await db.select().from(techSpecs).where(eq(techSpecs.projectId, projectId));
  return row?.data ?? {};
}

export async function updateTechSpec(db: Db, userId: string, projectId: string, input: Record<string, unknown>, reason = "") {
  await requireRole(db, userId, projectId, "tech.edit");
  const next = parseTechSpec(input);
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(techSpecs).where(eq(techSpecs.projectId, projectId));
    const prev = row?.data ?? {};
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    for (const { key } of TECH_FIELDS) {
      if ((prev[key] ?? "") !== (next[key] ?? "")) {
        before[key] = prev[key] ?? "";
        after[key] = next[key] ?? "";
      }
    }
    const changed = Object.keys(after);
    if (!changed.length) return 0;
    await tx
      .insert(techSpecs)
      .values({ projectId, data: next })
      .onConflictDoUpdate({ target: techSpecs.projectId, set: { data: next, updatedAt: new Date() } });
    const labels = changed.map((k) => TECH_FIELDS.find((f) => f.key === k)!.label).join(", ");
    await record(tx, { projectId, userId, entity: "tech_spec", entityId: projectId, action: "update", summary: `Mengubah Technical Page: ${labels}`, before, after, reason: reason.trim() });
    return changed.length;
  });
}

// ---------- team ----------

export async function getTeam(db: Db, projectId: string, opts: { includeInternal: boolean }) {
  const groups = await db.select().from(teamGroups).where(eq(teamGroups.projectId, projectId)).orderBy(asc(teamGroups.sortOrder), asc(teamGroups.name));
  const contacts = await db
    .select()
    .from(teamContacts)
    .where(opts.includeInternal ? eq(teamContacts.projectId, projectId) : and(eq(teamContacts.projectId, projectId), eq(teamContacts.internal, false)))
    .orderBy(desc(teamContacts.isPic), asc(teamContacts.name));
  return groups.map((g) => ({ ...g, contacts: contacts.filter((c) => c.groupId === g.id) }));
}

export async function addTeamGroup(db: Db, userId: string, projectId: string, name: string) {
  await requireRole(db, userId, projectId, "team.edit");
  const clean = name.trim();
  if (!clean) throw new InputError("Nama departemen wajib diisi.");
  await db.transaction(async (tx) => {
    const [g] = await tx.insert(teamGroups).values({ projectId, name: clean, sortOrder: 999 }).returning();
    await record(tx, { projectId, userId, entity: "team_group", entityId: g.id, action: "create", summary: `Menambah departemen "${clean}"` });
  });
}

export type ContactInput = {
  groupId: string; name: string; jobTitle: string; company: string; email: string; phone: string;
  isPic: boolean; isContact: boolean; needsAccess: boolean; internal: boolean; notes: string;
};

async function cleanContact(tx: Tx, projectId: string, input: ContactInput): Promise<ContactInput> {
  const name = input.name.trim();
  if (!name) throw new InputError("Nama kontak wajib diisi.");
  const [g] = await tx.select({ id: teamGroups.id }).from(teamGroups).where(and(eq(teamGroups.id, input.groupId), eq(teamGroups.projectId, projectId)));
  if (!g) throw new InputError("Departemen tidak ditemukan.");
  return { ...input, name, jobTitle: input.jobTitle.trim(), company: input.company.trim(), email: input.email.trim(), phone: input.phone.trim(), notes: input.notes.trim() };
}

export async function addContact(db: Db, userId: string, projectId: string, input: ContactInput) {
  await requireRole(db, userId, projectId, "team.edit");
  await db.transaction(async (tx) => {
    const data = await cleanContact(tx, projectId, input);
    const [c] = await tx.insert(teamContacts).values({ ...data, projectId }).returning();
    await record(tx, { projectId, userId, entity: "team_contact", entityId: c.id, action: "create", summary: `Menambah kontak "${c.name}"`, after: data });
  });
}

export async function updateContact(db: Db, userId: string, projectId: string, contactId: string, input: ContactInput) {
  await requireRole(db, userId, projectId, "team.edit");
  await db.transaction(async (tx) => {
    const where = and(eq(teamContacts.id, contactId), eq(teamContacts.projectId, projectId));
    const [before] = await tx.select().from(teamContacts).where(where);
    if (!before) throw new InputError("Kontak tidak ditemukan.");
    const data = await cleanContact(tx, projectId, input);
    await tx.update(teamContacts).set(data).where(where);
    await record(tx, { projectId, userId, entity: "team_contact", entityId: contactId, action: "update", summary: `Mengubah kontak "${data.name}"`, before, after: data });
  });
}

export async function deleteContact(db: Db, userId: string, projectId: string, contactId: string) {
  await requireRole(db, userId, projectId, "team.edit");
  await db.transaction(async (tx) => {
    const [before] = await tx.delete(teamContacts).where(and(eq(teamContacts.id, contactId), eq(teamContacts.projectId, projectId))).returning();
    if (before) await record(tx, { projectId, userId, entity: "team_contact", entityId: contactId, action: "delete", summary: `Menghapus kontak "${before.name}"`, before });
  });
}

// ---------- access: members and view-only links ----------

export async function listMembers(db: Db, projectId: string) {
  return db
    .select({ userId: users.id, name: users.name, email: users.email, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(users.name));
}

/** Adds an existing account by email, or creates one when name + password are given. */
export async function addMember(db: Db, userId: string, projectId: string, input: { email: string; role: Role; name?: string; password?: string }) {
  await requireRole(db, userId, projectId, "access.manage");
  const email = input.email.trim().toLowerCase();
  let [target] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email));
  if (!target) {
    if (!input.name?.trim() || !input.password) throw new InputError("Akun belum ada: isi nama dan password sementara untuk membuatnya.");
    target = await createUser(db, { name: input.name, email, password: input.password });
  }
  const targetId = target.id;
  await db.transaction(async (tx) => {
    await tx
      .insert(projectMembers)
      .values({ projectId, userId: targetId, role: input.role })
      .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role: input.role } });
    await record(tx, { projectId, userId, entity: "member", entityId: targetId, action: "create", summary: `Memberi akses ${input.role} ke ${target.name} (${email})` });
  });
}

export async function removeMember(db: Db, userId: string, projectId: string, targetId: string) {
  await requireRole(db, userId, projectId, "access.manage");
  if (targetId === userId) throw new InputError("Tidak bisa menghapus akses sendiri.");
  await db.transaction(async (tx) => {
    const [gone] = await tx.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, targetId))).returning();
    if (gone) await record(tx, { projectId, userId, entity: "member", entityId: targetId, action: "delete", summary: `Mencabut akses ${gone.role}` });
  });
}

export async function listShareLinks(db: Db, userId: string, projectId: string) {
  await requireRole(db, userId, projectId, "access.manage");
  return db.select().from(shareLinks).where(eq(shareLinks.projectId, projectId)).orderBy(desc(shareLinks.createdAt));
}

export async function createShareLink(db: Db, userId: string, projectId: string, label: string) {
  await requireRole(db, userId, projectId, "access.manage");
  const clean = label.trim() || "View only";
  return db.transaction(async (tx) => {
    const [link] = await tx.insert(shareLinks).values({ projectId, label: clean, token: randomBytes(24).toString("base64url"), createdBy: userId }).returning();
    await record(tx, { projectId, userId, entity: "share_link", entityId: link.id, action: "create", summary: `Membuat link view-only "${clean}"` });
    return link;
  });
}

export async function revokeShareLink(db: Db, userId: string, projectId: string, linkId: string) {
  await requireRole(db, userId, projectId, "access.manage");
  await db.transaction(async (tx) => {
    const [link] = await tx
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareLinks.id, linkId), eq(shareLinks.projectId, projectId), isNull(shareLinks.revokedAt)))
      .returning();
    if (link) await record(tx, { projectId, userId, entity: "share_link", entityId: linkId, action: "delete", summary: `Mencabut link view-only "${link.label}"` });
  });
}

/** Everything a view-only link may see. Null for unknown or revoked tokens. */
export async function getViewerData(db: Db, token: string) {
  const [row] = await db
    .select({ project: projects, label: shareLinks.label })
    .from(shareLinks)
    .innerJoin(projects, eq(projects.id, shareLinks.projectId))
    .where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)));
  if (!row) return null;
  const { getSchedule } = await import("./schedule/service");
  const { listAttachments } = await import("./assets/service");
  const schedule = await getSchedule(db, row.project.id, { includeInternal: false });
  const visible = new Set(schedule.tracks.flatMap((t) => t.items.map((i) => i.id)));
  // Links on hidden items stay hidden; comments are never sent to viewers.
  const { listDeliverables } = await import("./deliverables/service");
  const deliverables = await listDeliverables(db, row.project.id, { includeInternal: false });
  for (const d of deliverables) visible.add(d.id);
  const attachments = (await listAttachments(db, row.project.id, { includeInternal: false })).filter((a) => a.targetType === "project" || visible.has(a.targetId));
  const { getToday } = await import("./today/service");
  const { today } = await import("./schedule/dates");
  return {
    project: row.project,
    label: row.label,
    techSpec: await getTechSpec(db, row.project.id),
    team: await getTeam(db, row.project.id, { includeInternal: false }),
    schedule,
    attachments,
    deliverables,
    // Follow-up is an internal working list (with PIC contact details); viewers never get it.
    today: { ...(await getToday(db, row.project.id, today(), { includeInternal: false })), followUp: [] },
  };
}

// ---------- change log ----------

export async function listActivity(db: Db, projectId: string, limit = 200) {
  return db
    .select({ entry: auditLog, userName: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(eq(auditLog.projectId, projectId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
