CREATE TABLE "post_system"."feedback_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"body" text NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"from_who" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"checked_item_id" uuid,
	"check_note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_by" uuid,
	"checked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "post_system"."feedback_points" ADD CONSTRAINT "feedback_points_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."feedback_points" ADD CONSTRAINT "feedback_points_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."feedback_points" ADD CONSTRAINT "feedback_points_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."feedback_points" ENABLE ROW LEVEL SECURITY;
