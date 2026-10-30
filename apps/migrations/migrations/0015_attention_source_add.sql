-- MVP data: no backfill. Tagged sources get an item again on their next change.
TRUNCATE TABLE "attention_items" CASCADE;--> statement-breakpoint
ALTER TABLE "attention_items" ADD COLUMN "source_context" text NOT NULL;--> statement-breakpoint
ALTER TABLE "attention_items" ADD COLUMN "source_kind" text NOT NULL;--> statement-breakpoint
ALTER TABLE "attention_items" ADD COLUMN "source_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "attention_items" ADD COLUMN "preview" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attention_items" ADD COLUMN "due_source_event_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_attention_items_source" ON "attention_items" USING btree ("user_id","source_context","source_kind","source_id");--> statement-breakpoint
CREATE INDEX "idx_attention_items_due_source_event" ON "attention_items" USING btree ("due_source_event_id") WHERE deleted_at IS NULL AND status != 'resolved' AND due_source_event_id IS NOT NULL;