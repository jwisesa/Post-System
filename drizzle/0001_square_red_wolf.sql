CREATE TABLE "dependencies" (
	"item_id" uuid NOT NULL,
	"depends_on_id" uuid NOT NULL,
	CONSTRAINT "dependencies_item_id_depends_on_id_pk" PRIMARY KEY("item_id","depends_on_id")
);
--> statement-breakpoint
CREATE TABLE "schedule_items" (
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_item_id_schedule_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."schedule_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_depends_on_id_schedule_items_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."schedule_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_pic_contact_id_team_contacts_id_fk" FOREIGN KEY ("pic_contact_id") REFERENCES "public"."team_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;