ALTER TABLE "users" DROP CONSTRAINT "users_avatar_attachment_id_attachments_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "avatar_attachment_id";