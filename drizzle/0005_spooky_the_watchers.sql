CREATE TABLE "post_system"."shots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"reel" text DEFAULT '' NOT NULL,
	"clip_name" text DEFAULT '' NOT NULL,
	"source_file" text DEFAULT '' NOT NULL,
	"src_in" text NOT NULL,
	"src_out" text NOT NULL,
	"rec_in" text NOT NULL,
	"rec_out" text NOT NULL,
	"duration_frames" integer NOT NULL,
	"fps" text NOT NULL,
	"handles" integer DEFAULT 0 NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"retime" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"vendor" text DEFAULT '' NOT NULL,
	"version" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shots_project_id_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
ALTER TABLE "post_system"."shots" ADD CONSTRAINT "shots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."shots" ENABLE ROW LEVEL SECURITY;
