ALTER TABLE "post_system"."budget_drive_lines" ADD COLUMN "brand" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "post_system"."budget_drive_lines" ADD COLUMN "model" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "post_system"."budget_versions" ADD COLUMN "pricing" text DEFAULT 'items' NOT NULL;--> statement-breakpoint
ALTER TABLE "post_system"."budget_versions" ADD COLUMN "corrects_version_id" uuid;--> statement-breakpoint
ALTER TABLE "post_system"."budget_versions" ADD CONSTRAINT "budget_versions_corrects_version_id_budget_versions_id_fk" FOREIGN KEY ("corrects_version_id") REFERENCES "post_system"."budget_versions"("id") ON DELETE no action ON UPDATE no action;