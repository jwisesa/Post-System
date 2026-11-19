CREATE TABLE "post_system"."script_scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"script_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"number" text NOT NULL,
	"heading" text NOT NULL,
	"int_ext" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"time_of_day" text DEFAULT '' NOT NULL,
	"page_start" numeric NOT NULL,
	"page_end" numeric NOT NULL,
	"lines" integer NOT NULL,
	"est_seconds" integer NOT NULL,
	"characters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_name" text DEFAULT '' NOT NULL,
	"pages" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_system"."script_scenes" ADD CONSTRAINT "script_scenes_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "post_system"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."scripts" ADD CONSTRAINT "scripts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."scripts" ADD CONSTRAINT "scripts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "script_scenes_script_pos_idx" ON "post_system"."script_scenes" USING btree ("script_id","position");
--> statement-breakpoint
ALTER TABLE "post_system"."scripts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "post_system"."script_scenes" ENABLE ROW LEVEL SECURITY;
