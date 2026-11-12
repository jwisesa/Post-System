CREATE TABLE "post_system"."attachment_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"url" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."calendar_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "calendar_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "post_system"."comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"track_id" uuid,
	"platform" text DEFAULT '' NOT NULL,
	"group_name" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"origin" text DEFAULT 'delivered' NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"due_date" date,
	"notes" text DEFAULT '' NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"preset_id" text,
	"preset_version" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."dependencies" (
	"item_id" uuid NOT NULL,
	"depends_on_id" uuid NOT NULL,
	CONSTRAINT "dependencies_item_id_depends_on_id_pk" PRIMARY KEY("item_id","depends_on_id")
);
--> statement-breakpoint
CREATE TABLE "post_system"."project_members" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "post_system"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"production_type" text NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unit_count" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "post_system"."schedule_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"due_date" date NOT NULL,
	"baseline_start" date NOT NULL,
	"baseline_due" date NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"pic_contact_id" uuid,
	"hard_deadline" boolean DEFAULT false NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"token" text NOT NULL,
	"label" text NOT NULL,
	"created_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "post_system"."team_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"job_title" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"is_pic" boolean DEFAULT false NOT NULL,
	"is_contact" boolean DEFAULT false NOT NULL,
	"needs_access" boolean DEFAULT false NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."team_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."tech_specs" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "post_system"."attachment_versions" ADD CONSTRAINT "attachment_versions_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "post_system"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."attachment_versions" ADD CONSTRAINT "attachment_versions_status_by_users_id_fk" FOREIGN KEY ("status_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."attachment_versions" ADD CONSTRAINT "attachment_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."attachments" ADD CONSTRAINT "attachments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."attachments" ADD CONSTRAINT "attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."audit_log" ADD CONSTRAINT "audit_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."calendar_tokens" ADD CONSTRAINT "calendar_tokens_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."calendar_tokens" ADD CONSTRAINT "calendar_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "post_system"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."comments" ADD CONSTRAINT "comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."deliverables" ADD CONSTRAINT "deliverables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."deliverables" ADD CONSTRAINT "deliverables_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "post_system"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."dependencies" ADD CONSTRAINT "dependencies_item_id_schedule_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "post_system"."schedule_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."dependencies" ADD CONSTRAINT "dependencies_depends_on_id_schedule_items_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "post_system"."schedule_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "post_system"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."schedule_items" ADD CONSTRAINT "schedule_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."schedule_items" ADD CONSTRAINT "schedule_items_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "post_system"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."schedule_items" ADD CONSTRAINT "schedule_items_pic_contact_id_team_contacts_id_fk" FOREIGN KEY ("pic_contact_id") REFERENCES "post_system"."team_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "post_system"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."share_links" ADD CONSTRAINT "share_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."share_links" ADD CONSTRAINT "share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."team_contacts" ADD CONSTRAINT "team_contacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."team_contacts" ADD CONSTRAINT "team_contacts_group_id_team_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "post_system"."team_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."team_groups" ADD CONSTRAINT "team_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."tech_specs" ADD CONSTRAINT "tech_specs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."tracks" ADD CONSTRAINT "tracks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;