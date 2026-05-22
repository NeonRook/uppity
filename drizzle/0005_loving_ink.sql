CREATE TABLE "maintenance_window" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_window_monitor" (
	"window_id" text NOT NULL,
	"monitor_id" text NOT NULL,
	CONSTRAINT "maintenance_window_monitor_window_id_monitor_id_pk" PRIMARY KEY("window_id","monitor_id")
);
--> statement-breakpoint
ALTER TABLE "maintenance_window" ADD CONSTRAINT "maintenance_window_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_window" ADD CONSTRAINT "maintenance_window_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_window_monitor" ADD CONSTRAINT "mwm_window_fk" FOREIGN KEY ("window_id") REFERENCES "public"."maintenance_window"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_window_monitor" ADD CONSTRAINT "mwm_monitor_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maint_window_org_idx" ON "maintenance_window" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "maint_window_status_starts_idx" ON "maintenance_window" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "maint_window_status_ends_idx" ON "maintenance_window" USING btree ("status","ends_at");--> statement-breakpoint
CREATE INDEX "mwm_monitor_idx" ON "maintenance_window_monitor" USING btree ("monitor_id");