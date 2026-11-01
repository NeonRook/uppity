CREATE TABLE "email_suppression" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"suppressed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_event" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
