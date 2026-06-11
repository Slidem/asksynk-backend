CREATE TYPE "public"."calendar_link_origin" AS ENUM('imported', 'mirrored');--> statement-breakpoint
CREATE TYPE "public"."calendar_integration_status" AS ENUM('active', 'error', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."calendar_sync_direction" AS ENUM('bidirectional', 'readonly');--> statement-breakpoint
CREATE TABLE "calendar_event_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"asksynk_event_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"external_calendar_id" text NOT NULL,
	"external_event_id" text NOT NULL,
	"etag" text,
	"origin" "calendar_link_origin" NOT NULL,
	"degraded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_integrations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text NOT NULL,
	"status" "calendar_integration_status" DEFAULT 'active' NOT NULL,
	"sync_direction" "calendar_sync_direction" DEFAULT 'readonly' NOT NULL,
	"credentials" jsonb NOT NULL,
	"provider_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "integration_id" uuid;--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "sync_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "sync_token" text;--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "provider_state" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_asksynk_event_id_calendar_events_id_fk" FOREIGN KEY ("asksynk_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_integration_id_calendar_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."calendar_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_integrations" ADD CONSTRAINT "calendar_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_calendar_event_links_external" ON "calendar_event_links" USING btree ("integration_id","external_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_calendar_event_links_event_integration" ON "calendar_event_links" USING btree ("asksynk_event_id","integration_id");--> statement-breakpoint
CREATE INDEX "idx_calendar_event_links_event" ON "calendar_event_links" USING btree ("asksynk_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_calendar_integrations_account" ON "calendar_integrations" USING btree ("user_id","provider","external_account_id");--> statement-breakpoint
CREATE INDEX "idx_calendar_integrations_user" ON "calendar_integrations" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_integration_id_calendar_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."calendar_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_calendars_integration_external" ON "calendars" USING btree ("integration_id","external_id") WHERE integration_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_calendars_integration" ON "calendars" USING btree ("integration_id");