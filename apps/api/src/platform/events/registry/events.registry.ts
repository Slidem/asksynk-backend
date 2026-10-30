import z from "zod";

import { defineEvent } from "@/api/platform/events/registry/events.registration";
import { DeliveryMode } from "@/api/platform/events/registry/events.types";

const managedStatusSchema = z.object({
  type: z.literal("tagged_message"),
  status: z.enum(["created", "in_progress", "resolved"]),
});

const messageSnapshotSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  parentMessageId: z.string().nullable(),
  senderKind: z.enum(["user", "guest"]),
  senderId: z.string(),
  body: z.string(),
  tagIds: z.optional(z.array(z.string())),
  attachmentIds: z.optional(z.array(z.string())),
  suggestionId: z.string().nullable().optional(),
  managedStatus: managedStatusSchema.optional(),
  createdAt: z.string(),
});

export const TagUpdated = defineEvent({
  name: "tag.updated",
  schema: z.object({
    id: z.string(),
    name: z.string(),
    userId: z.string(),
    answerModeType: z.enum(["immediately", "timeblock"]),
  }),
  delivery: DeliveryMode.Dual,
});

export const TagDeleted = defineEvent({
  name: "tag.deleted",
  schema: z.object({
    tagId: z.string(),
    userId: z.string(),
  }),
  delivery: DeliveryMode.Durable,
});

export const MessageCreated = defineEvent({
  name: "message.created",
  schema: z.object({
    threadId: z.string(),
    message: messageSnapshotSchema,
    sentToUserId: z.string().optional(),
    sentToGuestId: z.string().optional(),
  }),
  delivery: DeliveryMode.Dual,
});

export const MessageUpdated = defineEvent({
  name: "message.updated",
  schema: z.object({
    threadId: z.string(),
    message: z.object({
      id: z.string(),
      threadId: z.string(),
      senderKind: z.enum(["user", "guest"]),
      senderId: z.string(),
      body: z.string(),
      tagIds: z.optional(z.array(z.string())),
      suggestionId: z.string().nullable().optional(),
      managedStatus: managedStatusSchema.optional(),
      createdAt: z.string(),
    }),
    sentToUserId: z.string().optional(),
    sentToGuestId: z.string().optional(),
  }),
  delivery: DeliveryMode.Dual,
});

// Recipient changed a tagged message's managed_status (WS message.updateStatus).
// Carries the message snapshot so the attention translator needs no lookup.
// Realtime leg pushes message.status.updated to the thread.
export const MessageManagedStatusChanged = defineEvent({
  name: "message.status.changed",
  schema: z.object({
    userId: z.string(),
    threadId: z.string(),
    messageId: z.string(),
    managedStatus: managedStatusSchema,
    message: messageSnapshotSchema,
  }),
  delivery: DeliveryMode.Dual,
});

export const CalendarEventCreated = defineEvent({
  name: "calendar.event.created",
  schema: z.object({
    eventId: z.string(),
    userId: z.string(),
    tagIds: z.optional(z.array(z.string())),
    startAt: z.string(),
    endAt: z.string(),
  }),
  delivery: DeliveryMode.Durable,
});

export const CalendarEventUpdated = defineEvent({
  name: "calendar.event.updated",
  schema: z.object({
    eventId: z.string(),
    userId: z.string(),
    tagIds: z.optional(z.array(z.string())),
    startAt: z.optional(z.string()),
    endAt: z.optional(z.string()),
  }),
  delivery: DeliveryMode.Durable,
});

export const CalendarEventDeleted = defineEvent({
  name: "calendar.event.deleted",
  schema: z.object({
    eventId: z.string(),
    userId: z.string(),
  }),
  delivery: DeliveryMode.Durable,
});

const focusSessionEndReasonSchema = z.enum([
  "manual_reset",
  "inactivity",
  "settings_changed",
]);

export const TimerLifecycle = defineEvent({
  name: "timer.lifecycle",
  schema: z.object({
    userId: z.string(),
    sessionId: z.string(),
    eventType: z.enum([
      "started",
      "paused",
      "resumed",
      "stopped",
      "completed",
      "skipped",
    ]),
    mode: z.enum(["focus", "short_break", "long_break"]),
    durationSeconds: z.number(),
    remainingSeconds: z.number(),
    // Set when a reset abandoned the block; null = the user's own action.
    reason: focusSessionEndReasonSchema.nullable(),
    occurredAt: z.string(),
  }),
  delivery: DeliveryMode.Dual,
});

// Only a WS push consumes it; no durable consumer group.
export const TimerSessionEnded = defineEvent({
  name: "timer.session_ended",
  schema: z.object({
    userId: z.string(),
    sessionId: z.string(),
    reason: focusSessionEndReasonSchema,
    finishedAt: z.string(),
  }),
  delivery: DeliveryMode.Realtime,
});

// Tasks emit durable domain events carrying their own state; tasks' attention
// translator maps them onto attention.source.*.
const taskStatusSchema = z.enum(["todo", "in_progress", "completed"]);

export const TaskUpserted = defineEvent({
  name: "task.upserted",
  schema: z.object({
    taskId: z.string(),
    assigneeUserId: z.string(),
    title: z.string(),
    status: taskStatusSchema,
    tagIds: z.array(z.string()),
    dueDate: z.string().nullable(),
    createdAt: z.string(),
  }),
  delivery: DeliveryMode.Durable,
});

export const TaskDeleted = defineEvent({
  name: "task.deleted",
  schema: z.object({ taskId: z.string(), assigneeUserId: z.string() }),
  delivery: DeliveryMode.Durable,
});

export const TaskBatchUpserted = defineEvent({
  name: "task.batch.upserted",
  schema: z.object({
    taskBatchId: z.string(),
    assigneeUserId: z.string(),
    title: z.string(),
    aggregateStatus: taskStatusSchema,
    tagIds: z.array(z.string()),
    dueDate: z.string().nullable(),
    createdAt: z.string(),
  }),
  delivery: DeliveryMode.Durable,
});

export const TaskBatchDeleted = defineEvent({
  name: "task.batch.deleted",
  schema: z.object({ taskBatchId: z.string(), assigneeUserId: z.string() }),
  delivery: DeliveryMode.Durable,
});

// Full post-state of a suggestion; shared by created / updated / resolved.
const taskSuggestionSnapshotSchema = z.object({
  suggestionId: z.string(),
  suggesteeUserId: z.string(),
  suggesterUserId: z.string(),
  status: z.enum(["pending", "accepted", "rejected"]),
  title: z.string(),
  dueDate: z.string().nullable(),
  createdAt: z.string(),
});

export const TaskSuggested = defineEvent({
  name: "task.suggestion.created",
  schema: taskSuggestionSnapshotSchema,
  delivery: DeliveryMode.Durable,
});

export const TaskSuggestionResolved = defineEvent({
  name: "task.suggestion.resolved",
  schema: taskSuggestionSnapshotSchema,
  delivery: DeliveryMode.Durable,
});

export const TaskSuggestionUpdated = defineEvent({
  name: "task.suggestion.updated",
  schema: taskSuggestionSnapshotSchema,
  delivery: DeliveryMode.Durable,
});

// Attention's ingestion contract (Published Language): each source's translator
// publishes one event per target user carrying the full projected state.
const attentionSourceSchema = z.object({
  context: z.string(),
  kind: z.string(),
  id: z.string(),
});

const attentionStatusSchema = z.enum(["created", "in_progress", "resolved"]);

const attentionPreviewSchema = z.object({
  title: z.string(),
  body: z.string().nullable(),
  actor: z
    .object({ kind: z.enum(["user", "guest"]), id: z.string() })
    .nullable(),
  // Source-specific display / navigation extras; opaque to attention.
  meta: z.record(z.string(), z.string()),
});

export const AttentionSourceUpserted = defineEvent({
  name: "attention.source.upserted",
  schema: z.object({
    userId: z.string(),
    source: attentionSourceSchema,
    preview: attentionPreviewSchema,
    tagIds: z.array(z.string()),
    status: attentionStatusSchema,
    // Non-null = explicit, pins the item.
    dueDate: z.string().nullable(),
    // Due-date policy base.
    occurredAt: z.string(),
  }),
  delivery: DeliveryMode.Durable,
});

export const AttentionSourceRemoved = defineEvent({
  name: "attention.source.removed",
  schema: z.object({ userId: z.string(), source: attentionSourceSchema }),
  delivery: DeliveryMode.Durable,
});

// An item turned resolved. No consumer yet (future momentum/insights); realtime
// so nothing piles up in the outbox. Switch to durable when a consumer group lands.
export const AttentionItemResolved = defineEvent({
  name: "attention.item.resolved",
  schema: z.object({
    userId: z.string(),
    itemId: z.string(),
    resolvedAt: z.string(),
    dueDate: z.string().nullable(),
    wasOverdue: z.boolean(),
  }),
  delivery: DeliveryMode.Realtime,
});

// Mirrors AttentionItemResponse (apps/api). Kept inline because the shared
// package must not depend on apps/api.
const attentionItemDtoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  source: attentionSourceSchema,
  preview: attentionPreviewSchema,
  status: attentionStatusSchema,
  tagIds: z.array(z.string()),
  dueDate: z.string().nullable(),
  dueDatePinned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Single generic upsert: clients keep a map keyed by item.id and upsert on every
// event; removal drops the id. Replaces the old created/updated pair so callers
// never have to decide which to emit, and tag/due edits stay id-stable.
export const AttentionItemUpserted = defineEvent({
  name: "attention.upserted",
  schema: z.object({ item: attentionItemDtoSchema }),
  delivery: DeliveryMode.Realtime,
});

export const AttentionItemRemoved = defineEvent({
  name: "attention.removed",
  schema: z.object({ id: z.string(), userId: z.string() }),
  delivery: DeliveryMode.Realtime,
});

// Mirrors TaskSuggestionResponse (apps/api) + materializedTasks. Kept inline
// because the shared package must not depend on apps/api.
const taskSuggestionDtoSchema = z.object({
  id: z.string(),
  suggesterUserId: z.string(),
  suggesteeUserId: z.string(),
  status: z.enum(["pending", "accepted", "rejected"]),
  payload: z.object({
    kind: z.enum(["task", "batch"]),
    title: z.string(),
    description: z.string().nullable(),
    dueDate: z.string().nullable(),
    tagIds: z.array(z.string()),
    tasks: z.array(
      z.object({
        title: z.string(),
        description: z.string().nullable(),
      }),
    ),
  }),
  // The real tasks created on accept (empty while pending/rejected).
  materializedTasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.enum(["todo", "in_progress", "completed"]),
    }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Broadcast to BOTH participants on any suggestion- or materialized-task-status
// change. Clients keyed by suggestion.id upsert on every event.
export const TaskSuggestionBroadcast = defineEvent({
  name: "task.suggestion.broadcast",
  schema: z.object({ suggestion: taskSuggestionDtoSchema }),
  delivery: DeliveryMode.Realtime,
});
