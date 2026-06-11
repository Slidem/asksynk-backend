import z from "zod";

import { defineEvent } from "./events.registration";
import { DeliveryMode } from "./events.types";

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
      createdAt: z.string(),
    }),
    participantUserIds: z.array(z.string()),
    participantGuestIds: z.array(z.string()),
  }),
  delivery: DeliveryMode.Dual,
  groups: ["attention-items"],
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
