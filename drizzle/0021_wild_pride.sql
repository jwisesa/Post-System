CREATE TABLE "post_system"."script_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"script_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_name" text NOT NULL,
	"to_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "script_aliases_script_id_kind_from_name_unique" UNIQUE("script_id","kind","from_name")
);
--> statement-breakpoint
ALTER TABLE "post_system"."script_aliases" ADD CONSTRAINT "script_aliases_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "post_system"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."script_aliases" ADD CONSTRAINT "script_aliases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."script_aliases" ADD CONSTRAINT "script_aliases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "post_system"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_system"."script_aliases" ENABLE ROW LEVEL SECURITY;
