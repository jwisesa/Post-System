CREATE TABLE "deliverables" (
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;