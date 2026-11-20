CREATE TABLE "post_system"."script_tag_kinds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"color" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "script_tag_kinds_project_id_key_unique" UNIQUE("project_id","key")
);
--> statement-breakpoint
ALTER TABLE "post_system"."script_tag_kinds" ADD CONSTRAINT "script_tag_kinds_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "script_tag_kinds_project_idx" ON "post_system"."script_tag_kinds" USING btree ("project_id");
--> statement-breakpoint
ALTER TABLE "post_system"."script_tag_kinds" ENABLE ROW LEVEL SECURITY;
