CREATE TYPE "public"."timer_event_type" AS ENUM('started', 'paused', 'resumed', 'stopped', 'completed');--> statement-breakpoint
CREATE TYPE "public"."timer_session_type" AS ENUM('focus', 'short_break', 'long_break');--> statement-breakpoint
CREATE TYPE "public"."timer_status" AS ENUM('idle', 'running', 'paused', 'completed', 'stopped');--> statement-breakpoint
CREATE TABLE "user_timer_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"event_type" timer_event_type NOT NULL,
	"session_type" timer_session_type NOT NULL,
	"session_duration_seconds" integer NOT NULL,
	"remaining_seconds" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_timer_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"focus_duration_seconds" integer DEFAULT 1500 NOT NULL,
	"short_break_duration_seconds" integer DEFAULT 300 NOT NULL,
	"long_break_duration_seconds" integer DEFAULT 900 NOT NULL,
	"long_break_interval" integer DEFAULT 4 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_timers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"status" timer_status DEFAULT 'idle' NOT NULL,
	"session_type" timer_session_type,
	"session_duration_seconds" integer,
	"transitioned_at" timestamp with time zone,
	"remaining_at_transition" integer,
	"pending_completion_job_ref" text,
	"completed_focus_sessions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_timer_events" ADD CONSTRAINT "user_timer_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_timer_settings" ADD CONSTRAINT "user_timer_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_timers" ADD CONSTRAINT "user_timers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_timer_events_user_occurred" ON "user_timer_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_timer_settings_user" ON "user_timer_settings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_timers_user" ON "user_timers" USING btree ("user_id");