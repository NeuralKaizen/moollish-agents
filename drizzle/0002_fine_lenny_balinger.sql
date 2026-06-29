CREATE TABLE "funders" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb NOT NULL,
	"themes" text,
	"geographies" text,
	"typical_amounts" text,
	"frequency" text,
	"eligible_entity" text,
	"required_documents" text,
	"winning_examples" text,
	"contacts" text,
	"language" text,
	"evaluation_criteria" text,
	"lessons_learned" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
