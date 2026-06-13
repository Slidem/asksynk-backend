ALTER TABLE "task_batches" DROP CONSTRAINT "task_batches_suggested_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_suggested_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "attention_items" ADD COLUMN "due_date_pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "task_batches" ADD COLUMN "assignee_user_id" text;--> statement-breakpoint
ALTER TABLE "task_batches" ADD COLUMN "due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "assignee_user_id" text;--> statement-breakpoint
UPDATE "tasks" t SET "assignee_user_id" = COALESCE(
  (SELECT ta."user_id" FROM "task_assignees" ta WHERE ta."task_id" = t."id" ORDER BY ta."user_id" LIMIT 1),
  t."created_by");--> statement-breakpoint
UPDATE "task_batches" b SET "assignee_user_id" = COALESCE(
  (SELECT t."assignee_user_id" FROM "tasks" t WHERE t."batch_id" = b."id" ORDER BY t."created_at" LIMIT 1),
  b."created_by");--> statement-breakpoint
UPDATE "tasks" t SET "assignee_user_id" = b."assignee_user_id" FROM "task_batches" b WHERE t."batch_id" = b."id";--> statement-breakpoint
ALTER TABLE "task_batches" ALTER COLUMN "assignee_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "assignee_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "task_batches" ADD CONSTRAINT "task_batches_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tasks_assignee_status" ON "tasks" USING btree ("assignee_user_id","status") WHERE deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "task_assignees" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "task_assignees" CASCADE;--> statement-breakpoint
ALTER TABLE "task_batches" DROP COLUMN "suggested_by";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "suggested_by";
