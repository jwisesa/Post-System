CREATE TABLE "post_system"."script_scene_text" (
	"scene_id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"blocks" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_system"."script_scene_text" ADD CONSTRAINT "script_scene_text_scene_id_script_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "post_system"."script_scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."script_scene_text" ADD CONSTRAINT "script_scene_text_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_system"."script_scene_text" ENABLE ROW LEVEL SECURITY;
