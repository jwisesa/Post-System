CREATE TABLE "post_system"."budget_bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"scope_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_bids_scope_id_vendor_id_unique" UNIQUE("scope_id","vendor_id")
);
--> statement-breakpoint
CREATE TABLE "post_system"."budget_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"bid_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."budget_picks" (
	"scenario_id" uuid NOT NULL,
	"scope_id" uuid NOT NULL,
	"bid_id" uuid NOT NULL,
	"version_id" uuid,
	"project_id" uuid NOT NULL,
	CONSTRAINT "budget_picks_scenario_id_scope_id_pk" PRIMARY KEY("scenario_id","scope_id")
);
--> statement-breakpoint
CREATE TABLE "post_system"."budget_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."budget_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"budget" bigint DEFAULT 0 NOT NULL,
	"phase_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deliverable_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."budget_vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"team_contact_id" uuid,
	"charges_ppn" boolean DEFAULT true NOT NULL,
	"withholds_pph23" boolean DEFAULT true NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_vendors_project_id_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "post_system"."budget_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"doc_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"doc_date" date,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" bigint NOT NULL,
	"ppn_rate_bp" integer,
	"ppn" bigint DEFAULT 0 NOT NULL,
	"pph23_rate_bp" integer,
	"pph23" bigint DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"status_note" text DEFAULT '' NOT NULL,
	"status_by" uuid,
	"status_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_versions_doc_id_number_unique" UNIQUE("doc_id","number")
);
--> statement-breakpoint
ALTER TABLE "post_system"."budget_bids" ADD CONSTRAINT "budget_bids_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_bids" ADD CONSTRAINT "budget_bids_scope_id_budget_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "post_system"."budget_scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_bids" ADD CONSTRAINT "budget_bids_vendor_id_budget_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "post_system"."budget_vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_docs" ADD CONSTRAINT "budget_docs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_docs" ADD CONSTRAINT "budget_docs_bid_id_budget_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "post_system"."budget_bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_picks" ADD CONSTRAINT "budget_picks_scenario_id_budget_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "post_system"."budget_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_picks" ADD CONSTRAINT "budget_picks_scope_id_budget_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "post_system"."budget_scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_picks" ADD CONSTRAINT "budget_picks_bid_id_budget_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "post_system"."budget_bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_picks" ADD CONSTRAINT "budget_picks_version_id_budget_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "post_system"."budget_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_picks" ADD CONSTRAINT "budget_picks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_scenarios" ADD CONSTRAINT "budget_scenarios_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_scenarios" ADD CONSTRAINT "budget_scenarios_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_scopes" ADD CONSTRAINT "budget_scopes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_vendors" ADD CONSTRAINT "budget_vendors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_vendors" ADD CONSTRAINT "budget_vendors_team_contact_id_team_contacts_id_fk" FOREIGN KEY ("team_contact_id") REFERENCES "post_system"."team_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_versions" ADD CONSTRAINT "budget_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_versions" ADD CONSTRAINT "budget_versions_doc_id_budget_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "post_system"."budget_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_versions" ADD CONSTRAINT "budget_versions_status_by_users_id_fk" FOREIGN KEY ("status_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_versions" ADD CONSTRAINT "budget_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_bids_project_idx" ON "post_system"."budget_bids" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_docs_quote_uq" ON "post_system"."budget_docs" USING btree ("bid_id") WHERE kind = 'quote';--> statement-breakpoint
CREATE INDEX "budget_docs_project_idx" ON "post_system"."budget_docs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "budget_picks_project_idx" ON "post_system"."budget_picks" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_scenarios_active_uq" ON "post_system"."budget_scenarios" USING btree ("project_id") WHERE is_active;--> statement-breakpoint
CREATE INDEX "budget_scenarios_project_idx" ON "post_system"."budget_scenarios" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "budget_scopes_project_idx" ON "post_system"."budget_scopes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "budget_vendors_project_idx" ON "post_system"."budget_vendors" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_versions_approved_uq" ON "post_system"."budget_versions" USING btree ("doc_id") WHERE status = 'approved';--> statement-breakpoint
CREATE INDEX "budget_versions_project_idx" ON "post_system"."budget_versions" USING btree ("project_id");
--> statement-breakpoint
ALTER TABLE "post_system"."budget_vendors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "post_system"."budget_scopes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "post_system"."budget_bids" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "post_system"."budget_docs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "post_system"."budget_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "post_system"."budget_scenarios" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "post_system"."budget_picks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION post_system.budget_version_frozen() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['status','status_note','status_by','status_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','status_note','status_by','status_at']) THEN
    RAISE EXCEPTION 'budget_versions: only status may change';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER budget_versions_frozen BEFORE UPDATE ON post_system.budget_versions FOR EACH ROW EXECUTE FUNCTION post_system.budget_version_frozen();
