CREATE TYPE "public"."outbox_delivery_mode" AS ENUM('realtime', 'durable', 'dual');--> statement-breakpoint
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
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"color" text,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"first_name" text,
	"last_name" text,
	"address" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_tags" ADD CONSTRAINT "calendar_event_tags_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_tags" ADD CONSTRAINT "calendar_event_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_exceptions" ADD CONSTRAINT "calendar_event_exceptions_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_public_view_id_public_views_id_fk" FOREIGN KEY ("public_view_id") REFERENCES "public"."public_views"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_guest_id_public_view_guests_id_fk" FOREIGN KEY ("sender_guest_id") REFERENCES "public"."public_view_guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_guest_id_public_view_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."public_view_guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_view_guests" ADD CONSTRAINT "public_view_guests_public_view_id_public_views_id_fk" FOREIGN KEY ("public_view_id") REFERENCES "public"."public_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_views" ADD CONSTRAINT "public_views_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_network" ADD CONSTRAINT "user_network_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_network" ADD CONSTRAINT "user_network_connection_id_users_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_calendar_events_calendar_start" ON "calendar_events" USING btree ("calendar_id","start");--> statement-breakpoint
CREATE INDEX "idx_calendar_events_recurring" ON "calendar_events" USING btree ("calendar_id") WHERE rrule IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_calendar_events_original" ON "calendar_events" USING btree ("original_event_id") WHERE original_event_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "calendars_user_asksynk_unique" ON "calendars" USING btree ("user_id") WHERE source = 'asksynk';--> statement-breakpoint
CREATE INDEX "idx_calendars_user" ON "calendars" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_message_threads_public_view" ON "message_threads" USING btree ("public_view_id");--> statement-breakpoint
CREATE INDEX "idx_messages_thread_created" ON "messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_thread_participants_user" ON "thread_participants" USING btree ("thread_id","user_id") WHERE user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_thread_participants_guest_per_thread" ON "thread_participants" USING btree ("thread_id","guest_id") WHERE guest_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_thread_participants_guest_single_thread" ON "thread_participants" USING btree ("guest_id") WHERE guest_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_thread_participants_user" ON "thread_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_thread_participants_guest" ON "thread_participants" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "idx_events_outbox_event_type" ON "events_outbox" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_public_view_guests_view" ON "public_view_guests" USING btree ("public_view_id");--> statement-breakpoint
CREATE INDEX "idx_public_views_owner" ON "public_views" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_invites_inviter_email_pending" ON "user_invites" USING btree ("inviter_user_id","invitee_email") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "idx_user_invites_invitee_email" ON "user_invites" USING btree ("invitee_email");--> statement-breakpoint
CREATE INDEX "idx_user_network_connection" ON "user_network" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_user_network_active" ON "user_network" USING btree ("user_id") WHERE removed_at IS NULL;
