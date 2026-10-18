ALTER TYPE "public"."timer_event_type" RENAME TO "timer_transition";--> statement-breakpoint
ALTER TABLE "user_timer_events" RENAME TO "user_timer_log";--> statement-breakpoint
ALTER TABLE "user_timer_log" RENAME COLUMN "event_type" TO "transition";--> statement-breakpoint
ALTER TABLE "user_timer_log" DROP CONSTRAINT "user_timer_events_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "idx_user_timer_events_user_occurred";--> statement-breakpoint
ALTER TABLE "user_timers" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_timer_log" ADD CONSTRAINT "user_timer_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_timer_log_user_occurred" ON "user_timer_log" USING btree ("user_id","occurred_at");