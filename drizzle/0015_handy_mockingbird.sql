CREATE TABLE "post_system"."budget_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"scope_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"doc_id" uuid,
	"termin" text DEFAULT '' NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"issue_date" date,
	"due_date" date,
	"subtotal" bigint NOT NULL,
	"ppn_rate_bp" integer,
	"ppn" bigint DEFAULT 0 NOT NULL,
	"pph23_rate_bp" integer,
	"pph23" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_system"."budget_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"amount" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_system"."budget_invoices" ADD CONSTRAINT "budget_invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_invoices" ADD CONSTRAINT "budget_invoices_scope_id_budget_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "post_system"."budget_scopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_invoices" ADD CONSTRAINT "budget_invoices_vendor_id_budget_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "post_system"."budget_vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_invoices" ADD CONSTRAINT "budget_invoices_doc_id_budget_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "post_system"."budget_docs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_invoices" ADD CONSTRAINT "budget_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_payments" ADD CONSTRAINT "budget_payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "post_system"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_payments" ADD CONSTRAINT "budget_payments_invoice_id_budget_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "post_system"."budget_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_system"."budget_payments" ADD CONSTRAINT "budget_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "post_system"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_invoices_project_idx" ON "post_system"."budget_invoices" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "budget_invoices_scope_idx" ON "post_system"."budget_invoices" USING btree ("scope_id");--> statement-breakpoint
CREATE INDEX "budget_payments_project_idx" ON "post_system"."budget_payments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "budget_payments_invoice_idx" ON "post_system"."budget_payments" USING btree ("invoice_id");--> statement-breakpoint
ALTER TABLE "post_system"."budget_invoices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "post_system"."budget_payments" ENABLE ROW LEVEL SECURITY;
