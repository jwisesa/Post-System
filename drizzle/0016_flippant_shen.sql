CREATE TABLE "post_system"."budget_drive_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"scenario_id" uuid NOT NULL,
	"scope_id" uuid NOT NULL,
	"vendor_id" uuid,
	"purpose" text NOT NULL,
	"media" text DEFAULT 'ssd' NOT NULL,
	"capacity_gb" integer NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_price" bigint DEFAULT 0 NOT NULL,
	"ppn_rate_bp" integer,
	"needed_by" date,
	"status" text DEFAULT 'planned' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."budget_settings" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"rates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_system"."budget_scenarios" ADD COLUMN "drive_calc" jsonb;--> statement-breakpoint
ALTER TABLE "post_system"."budget_drive_lines" ADD CONSTRAINT "budget_drive_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_drive_lines" ADD CONSTRAINT "budget_drive_lines_scenario_id_budget_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "post_system"."budget_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_drive_lines" ADD CONSTRAINT "budget_drive_lines_scope_id_budget_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "post_system"."budget_scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_drive_lines" ADD CONSTRAINT "budget_drive_lines_vendor_id_budget_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "post_system"."budget_vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_settings" ADD CONSTRAINT "budget_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_drive_lines_project_idx" ON "post_system"."budget_drive_lines" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "budget_drive_lines_scope_idx" ON "post_system"."budget_drive_lines" USING btree ("scope_id");
--> statement-breakpoint
ALTER TABLE "post_system"."budget_drive_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "post_system"."budget_settings" ENABLE ROW LEVEL SECURITY;
