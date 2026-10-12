ALTER TABLE "monitor" ADD COLUMN "follow_redirects" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "monitor" ADD COLUMN "accept_self_signed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "monitor_check" ADD COLUMN "dns_ms" integer;--> statement-breakpoint
ALTER TABLE "monitor_check" ADD COLUMN "connect_ms" integer;--> statement-breakpoint
ALTER TABLE "monitor_check" ADD COLUMN "tls_ms" integer;--> statement-breakpoint
ALTER TABLE "monitor_check" ADD COLUMN "first_byte_ms" integer;--> statement-breakpoint
ALTER TABLE "monitor_check" ADD COLUMN "redirect_count" integer;