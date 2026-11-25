import {
  type AnyPgColumn,
  bigint,
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
  /** Who the link is for (free text, admin only). */
  note: text("note").notNull().default(""),
  /** Which parts the link shows; see lib/share/sections. Budget and script can never be listed. */
  sections: jsonb("sections").$type<string[]>().notNull().default(["today", "timeline", "deliverables", "assets", "technical", "team"]),
  /** Schedule item and deliverable ids hidden on top of the internal flag. */
  hiddenIds: jsonb("hidden_ids").$type<string[]>().notNull().default([]),
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

// ---------- budget ----------
// Money is whole Rupiah (bigint, mode number; the service keeps |x| <= 1e15). Rates are integer basis points; quantities are thousandths.
// Phase / deliverable links on a scope are id arrays with no foreign key (resolved on read), so a timeline edit never touches financial data.

export type BudgetLine = { key: string; item: string; qtyMilli: number; unit: string; unitPrice: number; amount: number; note?: string };
export type BudgetVersionStatus = "draft" | "sent" | "negotiating" | "approved" | "rejected" | "superseded";

const money = (n: string) => bigint(n, { mode: "number" });
const projectRef = () => uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" });

export const budgetVendors = ps.table(
  "budget_vendors",
  {
    id: id(),
    projectId: projectRef(),
    name: text("name").notNull(),
    categories: jsonb("categories").$type<string[]>().notNull().default([]),
    contactName: text("contact_name").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    teamContactId: uuid("team_contact_id").references(() => teamContacts.id, { onDelete: "set null" }),
    chargesPpn: boolean("charges_ppn").notNull().default(true),
    withholdsPph23: boolean("withholds_pph23").notNull().default(true),
    notes: text("notes").notNull().default(""),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.projectId, t.name), index("budget_vendors_project_idx").on(t.projectId)],
);

export const budgetScopes = ps.table(
  "budget_scopes",
  {
    id: id(),
    projectId: projectRef(),
    name: text("name").notNull(),
    category: text("category").notNull().default("other"),
    /** Target, before tax. */
    budget: money("budget").notNull().default(0),
    phaseIds: jsonb("phase_ids").$type<string[]>().notNull().default([]),
    deliverableIds: jsonb("deliverable_ids").$type<string[]>().notNull().default([]),
    notes: text("notes").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("budget_scopes_project_idx").on(t.projectId)],
);

/** A candidate vendor within a scope. The vendor FK has no ON DELETE action on purpose (NO ACTION is checked at statement end, so deleteProject still works). */
export const budgetBids = ps.table(
  "budget_bids",
  {
    id: id(),
    projectId: projectRef(),
    scopeId: uuid("scope_id").notNull().references(() => budgetScopes.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id").notNull().references(() => budgetVendors.id),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.scopeId, t.vendorId), index("budget_bids_project_idx").on(t.projectId)],
);

/** A document series under a bid: the quote, or a change order. Versions hang off it. */
export const budgetDocs = ps.table(
  "budget_docs",
  {
    id: id(),
    projectId: projectRef(),
    bidId: uuid("bid_id").notNull().references(() => budgetBids.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"quote" | "change_order">().notNull(),
    title: text("title").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("budget_docs_quote_uq").on(t.bidId).where(sql`kind = 'quote'`), index("budget_docs_project_idx").on(t.projectId)],
);

/** Immutable once saved (DB trigger): only the status columns may change. Totals are frozen at save time. */
export const budgetVersions = ps.table(
  "budget_versions",
  {
    id: id(),
    projectId: projectRef(),
    docId: uuid("doc_id").notNull().references(() => budgetDocs.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    ref: text("ref").notNull().default(""),
    docDate: date("doc_date", { mode: "string" }),
    lines: jsonb("lines").$type<BudgetLine[]>().notNull().default([]),
    /** "items" = subtotal is the sum of priced lines; "lump" = subtotal is one package price and lines are unpriced sub-points. Set at INSERT only (frozen). */
    pricing: text("pricing").$type<"items" | "lump">().notNull().default("items"),
    /** Set when this version corrects an earlier one (set at INSERT only). */
    correctsVersionId: uuid("corrects_version_id").references((): AnyPgColumn => budgetVersions.id),
    subtotal: money("subtotal").notNull(),
    ppnRateBp: integer("ppn_rate_bp"),
    ppn: money("ppn").notNull().default(0),
    pph23RateBp: integer("pph23_rate_bp"),
    pph23: money("pph23").notNull().default(0),
    notes: text("notes").notNull().default(""),
    links: jsonb("links").$type<string[]>().notNull().default([]),
    status: text("status").$type<BudgetVersionStatus>().notNull().default("draft"),
    statusNote: text("status_note").notNull().default(""),
    statusBy: uuid("status_by").references(() => users.id),
    statusAt: timestamp("status_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.docId, t.number),
    uniqueIndex("budget_versions_approved_uq").on(t.docId).where(sql`status = 'approved'`),
    index("budget_versions_project_idx").on(t.projectId),
  ],
);

export const budgetScenarios = ps.table(
  "budget_scenarios",
  {
    id: id(),
    projectId: projectRef(),
    name: text("name").notNull(),
    notes: text("notes").notNull().default(""),
    isActive: boolean("is_active").notNull().default(false),
    /** Drive capacity calculator inputs (DriveCalc, validated by calcSchema). */
    driveCalc: jsonb("drive_calc").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("budget_scenarios_active_uq").on(t.projectId).where(sql`is_active`), index("budget_scenarios_project_idx").on(t.projectId)],
);

/** versionId null = follow the live approved version of the bid's quote. */
export const budgetPicks = ps.table(
  "budget_picks",
  {
    scenarioId: uuid("scenario_id").notNull().references(() => budgetScenarios.id, { onDelete: "cascade" }),
    scopeId: uuid("scope_id").notNull().references(() => budgetScopes.id, { onDelete: "cascade" }),
    bidId: uuid("bid_id").notNull().references(() => budgetBids.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => budgetVersions.id, { onDelete: "set null" }),
    projectId: projectRef(),
  },
  (t) => [primaryKey({ columns: [t.scenarioId, t.scopeId] }), index("budget_picks_project_idx").on(t.projectId)],
);

/** A termin / invoice of a vendor within a scope. "planned" = payment-terms plan, "received" = a real invoice. "Lunas" is derived from payments, never stored.
 *  scope/vendor FKs have no ON DELETE action on purpose (NO ACTION, checked at statement end, so deleteProject still works). */
export const budgetInvoices = ps.table(
  "budget_invoices",
  {
    id: id(),
    projectId: projectRef(),
    scopeId: uuid("scope_id").notNull().references(() => budgetScopes.id),
    vendorId: uuid("vendor_id").notNull().references(() => budgetVendors.id),
    docId: uuid("doc_id").references(() => budgetDocs.id, { onDelete: "set null" }),
    termin: text("termin").notNull().default(""),
    ref: text("ref").notNull().default(""),
    issueDate: date("issue_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    subtotal: money("subtotal").notNull(),
    ppnRateBp: integer("ppn_rate_bp"),
    ppn: money("ppn").notNull().default(0),
    pph23RateBp: integer("pph23_rate_bp"),
    pph23: money("pph23").notNull().default(0),
    status: text("status").$type<"planned" | "received" | "cancelled">().notNull().default("planned"),
    links: jsonb("links").$type<string[]>().notNull().default([]),
    notes: text("notes").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("budget_invoices_project_idx").on(t.projectId), index("budget_invoices_scope_idx").on(t.scopeId)],
);

/** Money actually transferred against an invoice (the net amount, after PPh 23 withholding). */
export const budgetPayments = ps.table(
  "budget_payments",
  {
    id: id(),
    projectId: projectRef(),
    invoiceId: uuid("invoice_id").notNull().references(() => budgetInvoices.id),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    amount: money("amount").notNull(),
    note: text("note").notNull().default(""),
    link: text("link").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("budget_payments_project_idx").on(t.projectId), index("budget_payments_invoice_idx").on(t.invoiceId)],
);

/** Shopping list of drives. vendor FK has no ON DELETE action on purpose (NO ACTION). */
export const budgetDriveLines = ps.table(
  "budget_drive_lines",
  {
    id: id(),
    projectId: projectRef(),
    scenarioId: uuid("scenario_id").notNull().references(() => budgetScenarios.id, { onDelete: "cascade" }),
    scopeId: uuid("scope_id").notNull().references(() => budgetScopes.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id").references(() => budgetVendors.id),
    purpose: text("purpose").$type<"ocf" | "proxy" | "grade" | "vfx" | "master" | "archive" | "other">().notNull(),
    brand: text("brand").notNull().default(""),
    model: text("model").notNull().default(""),
    media: text("media").$type<"ssd" | "hdd" | "raid" | "lto" | "other">().notNull().default("ssd"),
    capacityGb: integer("capacity_gb").notNull(),
    qty: integer("qty").notNull().default(1),
    unitPrice: money("unit_price").notNull().default(0),
    ppnRateBp: integer("ppn_rate_bp"),
    neededBy: date("needed_by", { mode: "string" }),
    status: text("status").$type<"planned" | "ordered" | "received" | "cancelled">().notNull().default("planned"),
    notes: text("notes").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("budget_drive_lines_project_idx").on(t.projectId), index("budget_drive_lines_scope_idx").on(t.scopeId)],
);

/** Per-project edits/additions to the built-in data-rate table. */
export const budgetSettings = ps.table("budget_settings", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  rates: jsonb("rates").$type<unknown[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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

/** Web Push endpoints of a user's devices. The push itself carries no data; see lib/push. */
export const pushSubscriptions = ps.table("push_subscriptions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: createdAt(),
});

/** In-app inbox + source for pushes. Never holds budget amounts, script text or reviewer comment bodies (lock screens). */
export const notifications = ps.table(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: projectRef(),
    kind: text("kind").$type<"deadline" | "invoice_due" | "review_comment" | "check">().notNull(),
    refId: uuid("ref_id"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    url: text("url").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    createdAt: createdAt(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);
