CREATE TABLE "opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responsible" text,
	"decision_reason" text,
	"analysis" jsonb NOT NULL,
	"tasks" jsonb NOT NULL
);
