ALTER TABLE "public_view_guests" ADD COLUMN "message_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "public_view_guests" ADD COLUMN "last_counted_message_id" uuid;--> statement-breakpoint
UPDATE "public_view_guests" g SET "message_count" = s.cnt, "last_counted_message_id" = s.last_id FROM (SELECT "sender_guest_id" AS guest_id, count(*)::int AS cnt, max("id"::text)::uuid AS last_id FROM "messages" WHERE "sender_guest_id" IS NOT NULL GROUP BY "sender_guest_id") s WHERE s.guest_id = g."id";
