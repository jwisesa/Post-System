CREATE TABLE "post_system"."schedule_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_system"."schedule_items" ADD COLUMN "pic_group_id" uuid;--> statement-breakpoint
ALTER TABLE "post_system"."schedule_templates" ADD CONSTRAINT "schedule_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "post_system"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_templates_owner_idx" ON "post_system"."schedule_templates" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "post_system"."schedule_items" ADD CONSTRAINT "schedule_items_pic_group_id_team_groups_id_fk" FOREIGN KEY ("pic_group_id") REFERENCES "post_system"."team_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."schedule_templates" ENABLE ROW LEVEL SECURITY;
