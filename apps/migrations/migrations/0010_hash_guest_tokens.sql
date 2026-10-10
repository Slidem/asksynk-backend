ALTER TABLE "public_view_guests" RENAME COLUMN "token" TO "token_hash";--> statement-breakpoint
ALTER TABLE "public_view_guests" RENAME CONSTRAINT "public_view_guests_token_unique" TO "public_view_guests_token_hash_unique";--> statement-breakpoint
UPDATE "public_view_guests" SET "token_hash" = encode(sha256(convert_to("token_hash", 'UTF8')), 'hex');
