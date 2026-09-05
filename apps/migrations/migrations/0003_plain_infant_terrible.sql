ALTER TABLE "tags" DROP CONSTRAINT "tags_name_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tags_user_name" ON "tags" USING btree ("user_id","name");