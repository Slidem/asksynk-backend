DROP INDEX "idx_attention_items_source_calendar_event";--> statement-breakpoint
ALTER TABLE "attention_items" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "attention_items" DROP COLUMN "note";--> statement-breakpoint
ALTER TABLE "attention_items" DROP COLUMN "metadata";--> statement-breakpoint
ALTER TABLE "attention_items" DROP COLUMN "source_calendar_event_id";--> statement-breakpoint
DROP TYPE "public"."attention_item_type";