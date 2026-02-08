CREATE TYPE "public"."answer_mode" AS ENUM('timeblock', 'immediately');--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text NOT NULL,
	"answer_mode" "answer_mode" NOT NULL,
	"response_time_millis" integer NOT NULL,
	"notifications_settings" jsonb DEFAULT '{"browserNotificationEnabled":true,"soundNotificationEnabled":true}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
