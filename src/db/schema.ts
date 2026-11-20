import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  unique,
  uniqueIndex,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { TemplateDef } from "@/lib/schedule/backward";

// Everything lives in its own schema so the app can share a database with other apps.
const ps = pgSchema("post_system");

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = ps.table("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const sessions = ps.table("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** Working-day rules for the timeline. Missing keys mean the defaults in lib/schedule/workdays. */
export type ScheduleSettings = { skipWeekends?: boolean; holidays?: { date: string; name: string }[]; cascade?: boolean; national?: boolean; jointLeave?: boolean; hoursPerDay?: number };

export const projects = ps.table("projects", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  productionType: text("production_type").notNull(),
  platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
  unitCount: integer("unit_count"), // episodes or reels
  status: text("status").notNull().default("active"),
  driveTrackerProjectId: uuid("drive_tracker_project_id"), // points into another app's table: no FK
  scheduleSettings: jsonb("schedule_settings").$type<ScheduleSettings>().notNull().default({}),
  createdAt: createdAt(),
});

export const projectMembers = ps.table(
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

export const shareLinks = ps.table("share_links", {
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

/** Per-person review links. Separate from share_links on purpose: a view-only token must never open reviewer data and vice versa. */
export const reviewerLinks = ps.table("reviewer_links", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  itemIds: jsonb("item_ids").$type<string[]>().notNull().default([]),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const techSpecs = ps.table("tech_specs", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Record<string, string>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const teamGroups = ps.table("team_groups", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const teamContacts = ps.table("team_contacts", {
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

export const auditLog = ps.table("audit_log", {
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

export const tracks = ps.table("tracks", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Main Feature, Trailer, Teaser, ...
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export type ItemStatus = "not_started" | "in_progress" | "review" | "done" | "on_hold";

export const scheduleItems = ps.table("schedule_items", {
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
  picGroupId: uuid("pic_group_id").references(() => teamGroups.id, { onDelete: "set null" }), // department in charge when no single PIC
  hardDeadline: boolean("hard_deadline").notNull().default(false),
  internal: boolean("internal").notNull().default(false),
  notes: text("notes").notNull().default(""),
  color: integer("color"), // 1..8 = --ph-N; null = inherit (milestone: its phase; phase: by position)
  workHours: integer("work_hours"), // planned effort of a phase in working hours; null = planned in days only
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Account-owned timeline template: structure only (a TemplateDef), never dates, status or people. */
export const scheduleTemplates = ps.table(
  "schedule_templates",
  {
    id: id(),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    data: jsonb("data").$type<TemplateDef>().notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("schedule_templates_owner_idx").on(t.ownerId)],
);

/** A named copy of the whole timeline (tracks, items, dependencies) that can be restored. */
export const scheduleVersions = ps.table("schedule_versions", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  snapshot: jsonb("snapshot").$type<ScheduleSnapshot>().notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export type ScheduleSnapshot = {
  tracks: { id: string; name: string; sortOrder: number }[];
  items: {
    id: string; trackId: string; parentId: string | null; name: string; startDate: string; dueDate: string; baselineStart: string; baselineDue: string;
    status: ItemStatus; picContactId: string | null; hardDeadline: boolean; internal: boolean; notes: string; color: number | null; workHours?: number | null; picGroupId?: string | null;
  }[];
  deps: { itemId: string; dependsOnId: string }[];
};

/** Finish-to-start: itemId cannot start before dependsOnId is due. */
export const dependencies = ps.table(
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

// ---------- attachments, versions, comments ----------

export type TargetType = "schedule_item" | "project" | "deliverable";
export type AttachmentKind = "preview" | "asset" | "document";
export type VersionStatus = "pending" | "approved" | "changes_requested";

/** A named link (e.g. "Offline Cut") attached to a schedule item, or a project-level document. */
export const attachments = ps.table("attachments", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  targetType: text("target_type").$type<TargetType>().notNull(),
  targetId: uuid("target_id").notNull(),
  kind: text("kind").$type<AttachmentKind>().notNull(),
  label: text("label").notNull(),
  internal: boolean("internal").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/** Every change to a link is a new version with a note on what changed. */
export const attachmentVersions = ps.table("attachment_versions", {
  id: id(),
  attachmentId: uuid("attachment_id")
    .notNull()
    .references(() => attachments.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  url: text("url").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").$type<VersionStatus>().notNull().default("pending"),
  statusBy: uuid("status_by").references(() => users.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const comments = ps.table("comments", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  targetType: text("target_type").$type<TargetType>().notNull(),
  targetId: uuid("target_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export type FeedbackStatus = "open" | "fixed" | "dropped";

/** A note raised at a review milestone; cross-checked at a later milestone of the same phase. */
export const feedbackPoints = ps.table("feedback_points", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** Schedule item it was raised at. No foreign key, like comments: removed with the item. */
  itemId: uuid("item_id").notNull(),
  body: text("body").notNull(),
  ref: text("ref").notNull().default(""),
  fromWho: text("from_who").notNull().default(""),
  reviewerLinkId: uuid("reviewer_link_id").references(() => reviewerLinks.id, { onDelete: "set null" }),
  status: text("status").$type<FeedbackStatus>().notNull().default("open"),
  checkedItemId: uuid("checked_item_id"),
  checkNote: text("check_note").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
  checkedBy: uuid("checked_by").references(() => users.id),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
});

/** A sign-off on a milestone. History is kept: revoking sets revokedAt. Not part of version snapshots. */
export const signoffs = ps.table(
  "signoffs",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** No foreign key, like feedback: removed with the item. */
    itemId: uuid("item_id").notNull(),
    signerName: text("signer_name").notNull(),
    signerRole: text("signer_role").notNull().default(""),
    reviewerLinkId: uuid("reviewer_link_id").references(() => reviewerLinks.id, { onDelete: "set null" }),
    recordedBy: uuid("recorded_by").references(() => users.id), // null = recorded through a link
    note: text("note").notNull().default(""),
    evidenceUrl: text("evidence_url").notNull().default(""),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id),
    revokeReason: text("revoke_reason").notNull().default(""),
  },
  (t) => [
    index("signoffs_project_item_idx").on(t.projectId, t.itemId),
    uniqueIndex("signoffs_link_item_active_uq").on(t.reviewerLinkId, t.itemId).where(sql`revoked_at is null and reviewer_link_id is not null`),
  ],
);

// ---------- deliverables ----------

export type DeliverableStatus = "not_started" | "in_progress" | "qc" | "delivered" | "accepted" | "rejected";

export const deliverables = ps.table("deliverables", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  trackId: uuid("track_id").references(() => tracks.id, { onDelete: "set null" }),
  platform: text("platform").notNull().default(""),
  groupName: text("group_name").notNull().default(""),
  name: text("name").notNull(),
  /** Known keys only: see SPEC_FIELDS in lib/deliverables/catalog. */
  spec: jsonb("spec").$type<Record<string, string>>().notNull().default({}),
  /** "derived" = produced by the platform from another deliverable; tracked for reference, not delivered. */
  origin: text("origin").$type<"delivered" | "derived">().notNull().default("delivered"),
  status: text("status").$type<DeliverableStatus>().notNull().default("not_started"),
  dueDate: date("due_date", { mode: "string" }),
  notes: text("notes").notNull().default(""),
  internal: boolean("internal").notNull().default(false),
  presetId: text("preset_id"),
  presetVersion: text("preset_version"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- shot tracker ----------

export type ShotStatus = "not_started" | "pulled" | "in_progress" | "review" | "approved";

/** VFX shots saved from the EDL tool. Re-saving a shot name updates its editorial fields and keeps the tracking ones. */
export const shots = ps.table(
  "shots",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    reel: text("reel").notNull().default(""),
    clipName: text("clip_name").notNull().default(""),
    sourceFile: text("source_file").notNull().default(""),
    srcIn: text("src_in").notNull(),
    srcOut: text("src_out").notNull(),
    recIn: text("rec_in").notNull(),
    recOut: text("rec_out").notNull(),
    durationFrames: integer("duration_frames").notNull(),
    fps: text("fps").notNull(),
    handles: integer("handles").notNull().default(0),
    scope: text("scope").notNull().default(""),
    retime: text("retime").notNull().default(""),
    status: text("status").$type<ShotStatus>().notNull().default("not_started"),
    vendor: text("vendor").notNull().default(""),
    version: text("version").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.projectId, t.name)],
);

// ---------- script analysis ----------

/** Headings, counts and estimates. The scene text lives in `script_scene_text` (members only); the PDF itself is never stored. */
export const scripts = ps.table("scripts", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sourceName: text("source_name").notNull().default(""),
  pages: integer("pages").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const scriptScenes = ps.table(
  "script_scenes",
  {
    id: id(),
    scriptId: uuid("script_id")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    position: integer("position").notNull(),
    number: text("number").notNull(),
    heading: text("heading").notNull(),
    intExt: text("int_ext").notNull().default(""),
    location: text("location").notNull().default(""),
    timeOfDay: text("time_of_day").notNull().default(""),
    pageStart: numeric("page_start", { mode: "number" }).notNull(),
    pageEnd: numeric("page_end", { mode: "number" }).notNull(),
    lines: integer("lines").notNull(),
    estSeconds: integer("est_seconds").notNull(),
    characters: jsonb("characters").$type<{ name: string; blocks: number }[]>().notNull().default([]),
    notes: text("notes").notNull().default(""),
    /** Post-production needs: matched keyword, the user's notes and a short excerpt (context) per kind. */
    postTags: jsonb("post_tags").$type<{ kind: string; note: string; auto: boolean; keyword?: string; excerpt?: string; itemId?: string | null }[]>().notNull().default([]),
  },
  (t) => [index("script_scenes_script_pos_idx").on(t.scriptId, t.position)],
);

/** The scene text in reading order. Kept apart from `script_scenes` so list queries never load it. */
export const scriptSceneText = ps.table("script_scene_text", {
  sceneId: uuid("scene_id")
    .primaryKey()
    .references(() => scriptScenes.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  blocks: jsonb("blocks").$type<{ t: "action" | "cue" | "paren" | "dialogue" | "transition"; text: string; ext?: string }[]>().notNull(),
});

/** The project's own post-needs tag kinds, next to the seven built-ins. `key` is a stable slug starting with "c-"; `color` 1..8 = the phase colours. */
export const scriptTagKinds = ps.table(
  "script_tag_kinds",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    color: integer("color").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.projectId, t.key), index("script_tag_kinds_project_idx").on(t.projectId)],
);

// ---------- calendar feed ----------

export const calendarTokens = ps.table("calendar_tokens", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
