import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const projects = pgTable("projects", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  productionType: text("production_type").notNull(),
  platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
  unitCount: integer("unit_count"), // episodes or reels
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<"supervisor" | "assistant">().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

export const shareLinks = pgTable("share_links", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  label: text("label").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const techSpecs = pgTable("tech_specs", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Record<string, string>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const teamGroups = pgTable("team_groups", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const teamContacts = pgTable("team_contacts", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  groupId: uuid("group_id")
    .notNull()
    .references(() => teamGroups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  jobTitle: text("job_title").notNull().default(""),
  company: text("company").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  isPic: boolean("is_pic").notNull().default(false), // person in charge
  isContact: boolean("is_contact").notNull().default(false), // person in contact
  needsAccess: boolean("needs_access").notNull().default(false),
  internal: boolean("internal").notNull().default(false), // hidden from view-only links
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
});

export const auditLog = pgTable("audit_log", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  summary: text("summary").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  reason: text("reason").notNull().default(""),
  createdAt: createdAt(),
});

// ---------- schedule ----------

export const tracks = pgTable("tracks", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Main Feature, Trailer, Teaser, ...
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export type ItemStatus = "not_started" | "in_progress" | "review" | "done" | "on_hold";

export const scheduleItems = pgTable("schedule_items", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  trackId: uuid("track_id")
    .notNull()
    .references(() => tracks.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"), // set for milestones inside a phase
  name: text("name").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  baselineStart: date("baseline_start", { mode: "string" }).notNull(),
  baselineDue: date("baseline_due", { mode: "string" }).notNull(),
  status: text("status").$type<ItemStatus>().notNull().default("not_started"),
  picContactId: uuid("pic_contact_id").references(() => teamContacts.id, { onDelete: "set null" }),
  hardDeadline: boolean("hard_deadline").notNull().default(false),
  internal: boolean("internal").notNull().default(false),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
});

/** Finish-to-start: itemId cannot start before dependsOnId is due. */
export const dependencies = pgTable(
  "dependencies",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => scheduleItems.id, { onDelete: "cascade" }),
    dependsOnId: uuid("depends_on_id")
      .notNull()
      .references(() => scheduleItems.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.dependsOnId] })],
);
