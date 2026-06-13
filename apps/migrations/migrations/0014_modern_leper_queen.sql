CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'completed');--> statement-breakpoint
ALTER TYPE "public"."attention_item_type" ADD VALUE 'task';--> statement-breakpoint
CREATE TABLE "task_assignees" (
	"task_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "task_assignees_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "task_batch_tags" (
	"batch_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "task_batch_tags_batch_id_tag_id_pk" PRIMARY KEY("batch_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "task_batches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_by" text NOT NULL,
	"suggested_by" text,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"suggester_user_id" text NOT NULL,
	"suggestee_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_tags" (
	"task_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "task_tags_task_id_tag_id_pk" PRIMARY KEY("task_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"batch_id" uuid,
	"created_by" text NOT NULL,
	"suggested_by" text,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"due_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_batch_tags" ADD CONSTRAINT "task_batch_tags_batch_id_task_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."task_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_batch_tags" ADD CONSTRAINT "task_batch_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_batches" ADD CONSTRAINT "task_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_batches" ADD CONSTRAINT "task_batches_suggested_by_users_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_suggester_user_id_users_id_fk" FOREIGN KEY ("suggester_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_suggestee_user_id_users_id_fk" FOREIGN KEY ("suggestee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_batch_id_task_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."task_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_suggested_by_users_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_task_assignees_user" ON "task_assignees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_task_batch_tags_tag" ON "task_batch_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_task_suggestions_suggestee_status" ON "task_suggestions" USING btree ("suggestee_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_task_suggestions_suggester" ON "task_suggestions" USING btree ("suggester_user_id");--> statement-breakpoint
CREATE INDEX "idx_task_tags_tag" ON "task_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_created_by_status" ON "tasks" USING btree ("created_by","status") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_tasks_batch" ON "tasks" USING btree ("batch_id") WHERE deleted_at IS NULL;