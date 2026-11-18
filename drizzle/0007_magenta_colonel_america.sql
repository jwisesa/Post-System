CREATE TABLE "post_system"."reviewer_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"token" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "reviewer_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "post_system"."signoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"signer_name" text NOT NULL,
	"signer_role" text DEFAULT '' NOT NULL,
	"reviewer_link_id" uuid,
	"recorded_by" uuid,
	"note" text DEFAULT '' NOT NULL,
	"evidence_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_system"."feedback_points" ADD COLUMN "reviewer_link_id" uuid;--> statement-breakpoint
ALTER TABLE "post_system"."reviewer_links" ADD CONSTRAINT "reviewer_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."reviewer_links" ADD CONSTRAINT "reviewer_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."signoffs" ADD CONSTRAINT "signoffs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."signoffs" ADD CONSTRAINT "signoffs_reviewer_link_id_reviewer_links_id_fk" FOREIGN KEY ("reviewer_link_id") REFERENCES "post_system"."reviewer_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."signoffs" ADD CONSTRAINT "signoffs_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."signoffs" ADD CONSTRAINT "signoffs_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signoffs_project_item_idx" ON "post_system"."signoffs" USING btree ("project_id","item_id");--> statement-breakpoint
ALTER TABLE "post_system"."feedback_points" ADD CONSTRAINT "feedback_points_reviewer_link_id_reviewer_links_id_fk" FOREIGN KEY ("reviewer_link_id") REFERENCES "post_system"."reviewer_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."reviewer_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post_system"."signoffs" ENABLE ROW LEVEL SECURITY;
