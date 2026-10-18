-- Focus sessions refactor, step 1 (drops). Data first: old log rows are discarded and every
-- timer restarts idle, so no row holds the dropped `stopped` status at the enum recreate.
TRUNCATE TABLE "user_timer_log";--> statement-breakpoint
UPDATE "user_timers" SET "status" = 'idle', "transitioned_at" = NULL, "remaining_at_transition" = NULL;--> statement-breakpoint
ALTER TABLE "user_timers" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user_timers" ALTER COLUMN "status" SET DEFAULT 'idle'::text;--> statement-breakpoint
DROP TYPE "public"."timer_status";--> statement-breakpoint
CREATE TYPE "public"."timer_status" AS ENUM('idle', 'running', 'paused', 'completed');--> statement-breakpoint
ALTER TABLE "user_timers" ALTER COLUMN "status" SET DEFAULT 'idle'::timer_status;--> statement-breakpoint
ALTER TABLE "user_timers" ALTER COLUMN "status" SET DATA TYPE timer_status USING "status"::timer_status;--> statement-breakpoint
ALTER TABLE "user_timer_log" DROP COLUMN "session_type";--> statement-breakpoint
ALTER TABLE "user_timer_log" DROP COLUMN "session_duration_seconds";--> statement-breakpoint
ALTER TABLE "user_timers" DROP COLUMN "session_type";--> statement-breakpoint
ALTER TABLE "user_timers" DROP COLUMN "session_duration_seconds";--> statement-breakpoint
ALTER TABLE "user_timers" DROP COLUMN "completed_focus_sessions";--> statement-breakpoint
DROP TYPE "public"."timer_session_type";