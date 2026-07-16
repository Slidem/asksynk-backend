CREATE TYPE "public"."attachment_placement" AS ENUM('public', 'message');--> statement-breakpoint
CREATE TYPE "public"."attachment_status" AS ENUM('pending', 'active');--> statement-breakpoint
CREATE TYPE "public"."attention_item_status" AS ENUM('created', 'in_progress', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."attention_item_type" AS ENUM('tagged_message', 'incoming_email', 'slack_message', 'whatsapp_message', 'suggested_timeblock', 'suggested_task', 'task');--> statement-breakpoint
CREATE TYPE "public"."calendar_link_origin" AS ENUM('imported', 'mirrored');--> statement-breakpoint
CREATE TYPE "public"."calendar_integration_status" AS ENUM('active', 'error', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."calendar_sync_direction" AS ENUM('bidirectional', 'readonly');--> statement-breakpoint
CREATE TYPE "public"."outbox_delivery_mode" AS ENUM('realtime', 'durable', 'dual');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."timer_event_type" AS ENUM('started', 'paused', 'resumed', 'stopped', 'completed');--> statement-breakpoint
CREATE TYPE "public"."timer_session_type" AS ENUM('focus', 'short_break', 'long_break');--> statement-breakpoint
CREATE TYPE "public"."timer_status" AS ENUM('idle', 'running', 'paused', 'completed', 'stopped');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_user_id" text NOT NULL,
	"placement" "attachment_placement" NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer,
	"file_name" text,
	"status" "attachment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"due_date_pinned" boolean DEFAULT false NOT NULL,
	"note" text,
	"metadata" jsonb NOT NULL,
	"source_calendar_event_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_event_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"asksynk_event_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"external_calendar_id" text NOT NULL,
	"external_event_id" text NOT NULL,
	"etag" text,
	"origin" "calendar_link_origin" NOT NULL,
	"degraded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_event_tags" (
	"event_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "calendar_event_tags_event_id_tag_id_pk" PRIMARY KEY("event_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"link" text,
	"start" timestamp NOT NULL,
	"duration_seconds" integer NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"timezone" text NOT NULL,
	"rrule" text,
	"color" text,
	"original_event_id" text,
	"original_start" timestamp,
	"recurrence_end" timestamp,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_event_exceptions" (
	"event_id" uuid NOT NULL,
	"original_start" timestamp NOT NULL,
	CONSTRAINT "calendar_event_exceptions_event_id_original_start_pk" PRIMARY KEY("event_id","original_start")
);
--> statement-breakpoint
CREATE TABLE "calendar_integrations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_account_id" text NOT NULL,
	"status" "calendar_integration_status" DEFAULT 'active' NOT NULL,
	"sync_direction" "calendar_sync_direction" DEFAULT 'readonly' NOT NULL,
	"credentials" jsonb NOT NULL,
	"provider_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"name" text,
	"color" text,
	"external_id" text,
	"integration_id" uuid,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"sync_token" text,
	"provider_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_tags" (
	"message_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "message_tags_message_id_tag_id_pk" PRIMARY KEY("message_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"message_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_attachments_message_id_attachment_id_pk" PRIMARY KEY("message_id","attachment_id")
);
--> statement-breakpoint
CREATE TABLE "message_threads" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"public_view_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"thread_id" uuid NOT NULL,
	"sender_user_id" text,
	"sender_guest_id" uuid,
	"parent_message_id" uuid,
	"suggestion_id" uuid,
	"managed_status" jsonb,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_messages_sender_one_of" CHECK ((sender_user_id IS NOT NULL) <> (sender_guest_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "thread_participants" (
	"thread_id" uuid NOT NULL,
	"user_id" text,
	"guest_id" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_thread_participant_one_of" CHECK ((user_id IS NOT NULL) <> (guest_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "events_outbox" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_type" text NOT NULL,
	"delivery_mode" "outbox_delivery_mode" NOT NULL,
	"groups" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dispatched_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_view_guests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"public_view_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_view_guests_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "public_views" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_user_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_views_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text NOT NULL,
	"answer_mode" jsonb DEFAULT '{"type":"immediately","responseTimeMillis":0}'::jsonb NOT NULL,
	"notifications_settings" jsonb DEFAULT '{"browserNotificationEnabled":true,"soundNotificationEnabled":true}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
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
	"assignee_user_id" text NOT NULL,
	"title" text NOT NULL,
	"due_date" timestamp with time zone,
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
	"materialized_task_id" uuid,
	"materialized_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_task_suggestions_materialized_one" CHECK (num_nonnulls(materialized_task_id, materialized_batch_id) <= 1)
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
	"assignee_user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"due_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_invites" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"inviter_user_id" text NOT NULL,
	"invitee_email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_network" (
	"user_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "user_network_user_id_connection_id_pk" PRIMARY KEY("user_id","connection_id"),
	CONSTRAINT "chk_user_network_no_self" CHECK (user_id <> connection_id)
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"attention_item_notifications" boolean DEFAULT true NOT NULL,
	"timer_notifications" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"address" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attention_item_tags" ADD CONSTRAINT "attention_item_tags_attention_item_id_attention_items_id_fk" FOREIGN KEY ("attention_item_id") REFERENCES "public"."attention_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attention_items" ADD CONSTRAINT "attention_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_integration_id_calendar_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."calendar_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_tags" ADD CONSTRAINT "calendar_event_tags_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_tags" ADD CONSTRAINT "calendar_event_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_exceptions" ADD CONSTRAINT "calendar_event_exceptions_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_integrations" ADD CONSTRAINT "calendar_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_integration_id_calendar_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."calendar_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_tags" ADD CONSTRAINT "message_tags_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_tags" ADD CONSTRAINT "message_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_public_view_id_public_views_id_fk" FOREIGN KEY ("public_view_id") REFERENCES "public"."public_views"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_guest_id_public_view_guests_id_fk" FOREIGN KEY ("sender_guest_id") REFERENCES "public"."public_view_guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_message_id_messages_id_fk" FOREIGN KEY ("parent_message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_suggestion_id_task_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."task_suggestions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_guest_id_public_view_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."public_view_guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_view_guests" ADD CONSTRAINT "public_view_guests_public_view_id_public_views_id_fk" FOREIGN KEY ("public_view_id") REFERENCES "public"."public_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_views" ADD CONSTRAINT "public_views_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_batch_tags" ADD CONSTRAINT "task_batch_tags_batch_id_task_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."task_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_batch_tags" ADD CONSTRAINT "task_batch_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_batches" ADD CONSTRAINT "task_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_batches" ADD CONSTRAINT "task_batches_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_suggester_user_id_users_id_fk" FOREIGN KEY ("suggester_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_suggestee_user_id_users_id_fk" FOREIGN KEY ("suggestee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_materialized_task_id_tasks_id_fk" FOREIGN KEY ("materialized_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_suggestions" ADD CONSTRAINT "task_suggestions_materialized_batch_id_task_batches_id_fk" FOREIGN KEY ("materialized_batch_id") REFERENCES "public"."task_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_batch_id_task_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."task_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_network" ADD CONSTRAINT "user_network_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_network" ADD CONSTRAINT "user_network_connection_id_users_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_timer_events" ADD CONSTRAINT "user_timer_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_timer_settings" ADD CONSTRAINT "user_timer_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_timers" ADD CONSTRAINT "user_timers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_attachments_storage_key" ON "attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "idx_attachments_owner_status" ON "attachments" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_attention_item_tags_tag" ON "attention_item_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_attention_items_user_status" ON "attention_items" USING btree ("user_id","status") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_attention_items_user_due_date" ON "attention_items" USING btree ("user_id","due_date") WHERE deleted_at IS NULL AND status != 'resolved';--> statement-breakpoint
CREATE INDEX "idx_attention_items_source_calendar_event" ON "attention_items" USING btree ("source_calendar_event_id") WHERE deleted_at IS NULL AND status != 'resolved' AND source_calendar_event_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_calendar_event_links_external" ON "calendar_event_links" USING btree ("integration_id","external_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_calendar_event_links_event_integration" ON "calendar_event_links" USING btree ("asksynk_event_id","integration_id");--> statement-breakpoint
CREATE INDEX "idx_calendar_event_links_event" ON "calendar_event_links" USING btree ("asksynk_event_id");--> statement-breakpoint
CREATE INDEX "idx_calendar_events_calendar_start" ON "calendar_events" USING btree ("calendar_id","start");--> statement-breakpoint
CREATE INDEX "idx_calendar_events_recurring" ON "calendar_events" USING btree ("calendar_id") WHERE rrule IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_calendar_events_original" ON "calendar_events" USING btree ("original_event_id") WHERE original_event_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_calendar_integrations_account" ON "calendar_integrations" USING btree ("user_id","provider","external_account_id");--> statement-breakpoint
CREATE INDEX "idx_calendar_integrations_user" ON "calendar_integrations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendars_user_asksynk_unique" ON "calendars" USING btree ("user_id") WHERE source = 'asksynk';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_calendars_integration_external" ON "calendars" USING btree ("integration_id","external_id") WHERE integration_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_calendars_user" ON "calendars" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_calendars_integration" ON "calendars" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX "idx_message_tags_tag" ON "message_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_message_attachments_attachment" ON "message_attachments" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "idx_message_threads_public_view" ON "message_threads" USING btree ("public_view_id");--> statement-breakpoint
CREATE INDEX "idx_messages_thread_created" ON "messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_parent_created" ON "messages" USING btree ("parent_message_id","created_at") WHERE parent_message_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_thread_participants_user" ON "thread_participants" USING btree ("thread_id","user_id") WHERE user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_thread_participants_guest_per_thread" ON "thread_participants" USING btree ("thread_id","guest_id") WHERE guest_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_thread_participants_guest_single_thread" ON "thread_participants" USING btree ("guest_id") WHERE guest_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_thread_participants_user" ON "thread_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_thread_participants_guest" ON "thread_participants" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "idx_events_outbox_event_type" ON "events_outbox" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_public_view_guests_view" ON "public_view_guests" USING btree ("public_view_id");--> statement-breakpoint
CREATE INDEX "idx_public_views_owner" ON "public_views" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_task_batch_tags_tag" ON "task_batch_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_task_suggestions_suggestee_status" ON "task_suggestions" USING btree ("suggestee_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_task_suggestions_suggester" ON "task_suggestions" USING btree ("suggester_user_id");--> statement-breakpoint
CREATE INDEX "idx_task_suggestions_materialized_task" ON "task_suggestions" USING btree ("materialized_task_id") WHERE materialized_task_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_task_suggestions_materialized_batch" ON "task_suggestions" USING btree ("materialized_batch_id") WHERE materialized_batch_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_task_tags_tag" ON "task_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_created_by_status" ON "tasks" USING btree ("created_by","status") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_tasks_assignee_status" ON "tasks" USING btree ("assignee_user_id","status") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_tasks_batch" ON "tasks" USING btree ("batch_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_invites_inviter_email_pending" ON "user_invites" USING btree ("inviter_user_id","invitee_email") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "idx_user_invites_invitee_email" ON "user_invites" USING btree ("invitee_email");--> statement-breakpoint
CREATE INDEX "idx_user_network_connection" ON "user_network" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_user_network_active" ON "user_network" USING btree ("user_id") WHERE removed_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_settings_user" ON "user_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_timer_events_user_occurred" ON "user_timer_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_timer_settings_user" ON "user_timer_settings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_timers_user" ON "user_timers" USING btree ("user_id");