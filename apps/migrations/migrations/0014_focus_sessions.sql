CREATE TYPE "public"."focus_session_end_reason" AS ENUM('manual_reset', 'inactivity', 'settings_changed');--> statement-breakpoint
CREATE TYPE "public"."timer_mode" AS ENUM('focus', 'short_break', 'long_break');--> statement-breakpoint
ALTER TYPE "public"."timer_transition" ADD VALUE 'skipped';--> statement-breakpoint
CREATE TABLE "focus_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"end_reason" "focus_session_end_reason",
	"completed_focus_blocks" integer DEFAULT 0 NOT NULL,
	"short_breaks" integer DEFAULT 0 NOT NULL,
	"long_breaks" integer DEFAULT 0 NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_timer_log" ADD COLUMN "session_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "user_timer_log" ADD COLUMN "mode" timer_mode NOT NULL;--> statement-breakpoint
ALTER TABLE "user_timer_log" ADD COLUMN "duration_seconds" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "user_timer_log" ADD COLUMN "reason" "focus_session_end_reason";--> statement-breakpoint
ALTER TABLE "user_timer_settings" ADD COLUMN "inactivity_timeout_seconds" integer DEFAULT 3600;--> statement-breakpoint
ALTER TABLE "user_timers" ADD COLUMN "mode" timer_mode;--> statement-breakpoint
ALTER TABLE "user_timers" ADD COLUMN "current_session_id" uuid;--> statement-breakpoint
ALTER TABLE "user_timers" ADD COLUMN "focus_blocks_until_long_break" integer;--> statement-breakpoint
ALTER TABLE "user_timers" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_focus_sessions_user_started" ON "focus_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
ALTER TABLE "user_timer_log" ADD CONSTRAINT "user_timer_log_session_id_focus_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."focus_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_timers" ADD CONSTRAINT "user_timers_current_session_id_focus_sessions_id_fk" FOREIGN KEY ("current_session_id") REFERENCES "public"."focus_sessions"("id") ON DELETE set null ON UPDATE no action;