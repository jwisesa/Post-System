CREATE TABLE "post_system"."schedule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_system"."projects" ADD COLUMN "schedule_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "post_system"."schedule_items" ADD COLUMN "color" integer;--> statement-breakpoint
ALTER TABLE "post_system"."schedule_versions" ADD CONSTRAINT "schedule_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."schedule_versions" ADD CONSTRAINT "schedule_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "post_system"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."schedule_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Picture Lock is a milestone of Offline Edit, not a phase of its own: whatever
-- waited for the lock now waits for Offline Edit, and the lock sits on its last day.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT l.id AS lock_id, o.id AS offline_id, o.due_date AS due
    FROM post_system.schedule_items l
    JOIN post_system.schedule_items o ON o.track_id = l.track_id AND o.name = 'Offline Edit' AND o.parent_id IS NULL
    WHERE l.name = 'Picture Lock' AND l.parent_id IS NULL
  LOOP
    INSERT INTO post_system.dependencies (item_id, depends_on_id)
      SELECT item_id, r.offline_id FROM post_system.dependencies WHERE depends_on_id = r.lock_id AND item_id <> r.offline_id
      ON CONFLICT DO NOTHING;
    DELETE FROM post_system.dependencies WHERE depends_on_id = r.lock_id OR item_id = r.lock_id;
    UPDATE post_system.schedule_items SET parent_id = r.offline_id, start_date = r.due, due_date = r.due WHERE id = r.lock_id;
  END LOOP;
END $$;
