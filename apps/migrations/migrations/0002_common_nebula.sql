CREATE TABLE "message_tags" (
	"message_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "message_tags_message_id_tag_id_pk" PRIMARY KEY("message_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "message_tags" ADD CONSTRAINT "message_tags_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_tags" ADD CONSTRAINT "message_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_message_tags_tag" ON "message_tags" USING btree ("tag_id");