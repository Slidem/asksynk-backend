CREATE TYPE "public"."attention_item_status" AS ENUM('created', 'in_progress', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."attention_item_type" AS ENUM('tagged_message', 'incoming_email', 'slack_message', 'whatsapp_message', 'suggested_timeblock', 'suggested_task');--> statement-breakpoint
CREATE TABLE "attention_item_tags" (
	"attention_item_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "attention_item_tags_attention_item_id_tag_id_pk" PRIMARY KEY("attention_item_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "attention_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"type" "attention_item_type" NOT NULL,
	"status" "attention_item_status" DEFAULT 'created' NOT NULL,
	"due_date" timestamp with time zone,
	"note" text,
	"metadata" jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attention_item_tags" ADD CONSTRAINT "attention_item_tags_attention_item_id_attention_items_id_fk" FOREIGN KEY ("attention_item_id") REFERENCES "public"."attention_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attention_item_tags" ADD CONSTRAINT "attention_item_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attention_items" ADD CONSTRAINT "attention_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attention_item_tags_tag" ON "attention_item_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_attention_items_user_status" ON "attention_items" USING btree ("user_id","status") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_attention_items_user_due_date" ON "attention_items" USING btree ("user_id","due_date") WHERE deleted_at IS NULL AND status != 'resolved';