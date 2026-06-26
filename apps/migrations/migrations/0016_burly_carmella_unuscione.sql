ALTER TABLE "messages" ADD COLUMN "suggestion_id" uuid;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD COLUMN "materialized_task_id" uuid;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD COLUMN "materialized_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_suggestion_id_task_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."task_suggestions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_materialized_task_id_tasks_id_fk" FOREIGN KEY ("materialized_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_materialized_batch_id_task_batches_id_fk" FOREIGN KEY ("materialized_batch_id") REFERENCES "public"."task_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_task_suggestions_materialized_task" ON "task_suggestions" USING btree ("materialized_task_id") WHERE materialized_task_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_task_suggestions_materialized_batch" ON "task_suggestions" USING btree ("materialized_batch_id") WHERE materialized_batch_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "chk_task_suggestions_materialized_one" CHECK (num_nonnulls(materialized_task_id, materialized_batch_id) <= 1);