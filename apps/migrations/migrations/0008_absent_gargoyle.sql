DROP INDEX "idx_events_outbox_event_type";--> statement-breakpoint
ALTER TABLE "events_dead_letters" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_events_outbox_pending" ON "events_outbox" USING btree ("id") WHERE dispatched_at IS NULL AND failed_at IS NULL AND delivery_mode IN ('durable', 'dual');