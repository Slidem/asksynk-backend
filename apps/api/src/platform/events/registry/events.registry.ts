import z from "zod";

import { defineEvent } from "./events.registration";
import { DeliveryMode } from "./events.types";

// A managed message's status mirrors the attention-item status 1:1.
const managedStatusEnum = z.enum(["created", "in_progress", "resolved"]);
const managedStatusSchema = z.object({
  type: z.literal("tagged_message"),
  status: managedStatusEnum,
});

export const TagCreated = defineEvent({
  name: "tag.created",
  schema: z.object({
    id: z.string(),
    name: z.string(),
    userId: z.string(),
  }),
  delivery: DeliveryMode.Durable,
  groups: ["email"],
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
  groups: ["email", "attention-items"],
});

export const TagDeleted = defineEvent({
  name: "tag.deleted",
  schema: z.object({
    tagId: z.string(),
    userId: z.string(),
  }),
  delivery: DeliveryMode.Durable,
  groups: ["attention-items"],
});

export const MessageCreated = defineEvent({
  name: "message.created",
  schema: z.object({
    threadId: z.string(),
    message: z.object({
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
    }),
    participantUserIds: z.array(z.string()),
    participantGuestIds: z.array(z.string()),
  }),
  delivery: DeliveryMode.Dual,
  groups: ["attention-items"],
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
    participantUserIds: z.array(z.string()),
    participantGuestIds: z.array(z.string()),
  }),
  delivery: DeliveryMode.Dual,
  groups: ["attention-items"],
});

// Recipient changed a tagged message's managed_status (WS message.updateStatus)
// or it was synced from the inbox. Durable leg mirrors it onto the linked
// attention item; realtime leg pushes message.status.updated to the thread.
export const MessageManagedStatusChanged = defineEvent({
  name: "message.status.changed",
  schema: z.object({
    threadId: z.string(),
    messageId: z.string(),
    managedStatus: managedStatusSchema,
  }),
  delivery: DeliveryMode.Dual,
  groups: ["attention-items"],
});

// Reverse sync: a tagged_message attention item's status was changed from the
// inbox (PATCH /attention-items/:id). The messaging consumer reflects it back
// onto the message. Published only from the user PATCH, never from the forward
// sync, so the two directions cannot loop.
export const AttentionMessageStatusChanged = defineEvent({
  name: "attention.message.synced",
  schema: z.object({
    messageId: z.string(),
    status: managedStatusEnum,
  }),
  delivery: DeliveryMode.Durable,
  groups: ["messaging"],
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
  groups: ["attention-items", "calendar-sync"],
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
  groups: ["attention-items", "calendar-sync"],
});

export const CalendarEventDeleted = defineEvent({
  name: "calendar.event.deleted",
  schema: z.object({
    eventId: z.string(),
    userId: z.string(),
  }),
  delivery: DeliveryMode.Durable,
  groups: ["attention-items", "calendar-sync"],
});

export const TimerLifecycle = defineEvent({
  name: "timer.lifecycle",
  schema: z.object({
    userId: z.string(),
    eventType: z.enum(["started", "paused", "resumed", "stopped", "completed"]),
    sessionType: z.enum(["focus", "short_break", "long_break"]),
    sessionDurationSeconds: z.number(),
    remainingSeconds: z.number(),
    occurredAt: z.string(),
  }),
  delivery: DeliveryMode.Dual,
  groups: ["timer-event-log"],
});

// Tasks emit durable domain events; the attention-items consumer group mirrors
// them into attention items. Status fields already carry the mapped attention
// status (created|in_progress|resolved) so the consumer needs no task imports.
const attentionStatusSchema = z.enum(["created", "in_progress", "resolved"]);

export const TaskUpserted = defineEvent({
  name: "task.upserted",
  schema: z.object({
    taskId: z.string(),
    assigneeUserId: z.string(),
    title: z.string(),
    status: attentionStatusSchema,
    tagIds: z.array(z.string()),
    dueDate: z.string().nullable(),
    dueDatePinned: z.boolean(),
    createdAt: z.string(),
  }),
  delivery: DeliveryMode.Durable,
  // suggestion-sync: independent queue that rebroadcasts the parent suggestion
  // (if any) when a materialized task changes. Must NOT share attention-items'
  // queue or events would be split between the two consumers.
  groups: ["attention-items", "suggestion-sync"],
});

export const TaskDeleted = defineEvent({
  name: "task.deleted",
  schema: z.object({ taskId: z.string() }),
  delivery: DeliveryMode.Durable,
  groups: ["attention-items"],
});

export const TaskBatchUpserted = defineEvent({
  name: "task.batch.upserted",
  schema: z.object({
    taskBatchId: z.string(),
    assigneeUserId: z.string(),
    title: z.string(),
    aggregateStatus: attentionStatusSchema,
    tagIds: z.array(z.string()),
    dueDate: z.string().nullable(),
    dueDatePinned: z.boolean(),
    createdAt: z.string(),
  }),
  delivery: DeliveryMode.Durable,
  groups: ["attention-items", "suggestion-sync"],
});

export const TaskBatchDeleted = defineEvent({
  name: "task.batch.deleted",
  schema: z.object({ taskBatchId: z.string() }),
  delivery: DeliveryMode.Durable,
  groups: ["attention-items"],
});

export const TaskSuggested = defineEvent({
  name: "task.suggestion.created",
  schema: z.object({
    suggestionId: z.string(),
    suggesteeUserId: z.string(),
    suggesterUserId: z.string(),
    title: z.string(),
    dueDate: z.string().nullable(),
  }),
  delivery: DeliveryMode.Durable,
  groups: ["attention-items"],
});

export const TaskSuggestionResolved = defineEvent({
  name: "task.suggestion.resolved",
  schema: z.object({ suggestionId: z.string() }),
  delivery: DeliveryMode.Durable,
  groups: ["attention-items"],
});

export const TaskSuggestionUpdated = defineEvent({
  name: "task.suggestion.updated",
  schema: z.object({
    suggestionId: z.string(),
    title: z.string(),
    dueDate: z.string().nullable(),
  }),
  delivery: DeliveryMode.Durable,
  groups: ["attention-items"],
});

const attentionItemTypeSchema = z.enum([
  "tagged_message",
  "incoming_email",
  "slack_message",
  "whatsapp_message",
  "suggested_timeblock",
  "suggested_task",
  "task",
]);

// Mirrors AttentionItemResponse (apps/api). Kept inline because the shared
// package must not depend on apps/api. metadata is `{ type } & Partial<...>`.
const attentionItemDtoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: attentionItemTypeSchema,
  status: z.enum(["created", "in_progress", "resolved"]),
  dueDate: z.string().nullable(),
  note: z.string().nullable(),
  metadata: z.object({
    type: attentionItemTypeSchema,
    messageId: z.string().optional(),
    threadId: z.string().optional(),
    senderId: z.string().optional(),
    senderType: z.enum(["user", "guest"]).optional(),
    content: z.string().optional(),
    originalTagIds: z.array(z.string()).optional(),
    title: z.string().optional(),
    taskId: z.string().optional(),
    taskBatchId: z.string().optional(),
    suggestionId: z.string().optional(),
    suggesterUserId: z.string().optional(),
  }),
  tagIds: z.array(z.string()),
  sourceCalendarEventId: z.string().nullable(),
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
