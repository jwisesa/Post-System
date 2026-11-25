ALTER TABLE "post_system"."share_links" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "post_system"."share_links" ADD COLUMN "sections" jsonb DEFAULT '["today","timeline","deliverables","assets","technical","team"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "post_system"."share_links" ADD COLUMN "hidden_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;