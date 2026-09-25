CREATE TYPE "public"."events_dead_letter_status" AS ENUM('pending', 'replayed', 'discarded');--> statement-breakpoint
CREATE TABLE "events_dead_letters" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"consumer_group" text NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"error" text NOT NULL,
	"attempts" integer NOT NULL,
	"status" "events_dead_letter_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_events_dead_letters_event_group" ON "events_dead_letters" USING btree ("event_id","consumer_group");--> statement-breakpoint
CREATE INDEX "idx_events_dead_letters_status_created" ON "events_dead_letters" USING btree ("status","created_at");