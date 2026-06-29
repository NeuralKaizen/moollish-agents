CREATE TABLE "processed_emails" (
	"message_id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"opportunity_id" text
);
