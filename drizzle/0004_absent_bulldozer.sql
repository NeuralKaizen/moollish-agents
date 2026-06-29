CREATE TABLE "detected_opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"title" text NOT NULL,
	"funder" text,
	"amount" text,
	"currency" text,
	"deadline" text,
	"url" text,
	"themes" text,
	"status" text NOT NULL,
	"opportunity_id" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
