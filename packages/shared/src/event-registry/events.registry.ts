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
  }),
  delivery: DeliveryMode.Durable,
  groups: ["email"],
});

export const MessageCreated = defineEvent({
  name: "message.created",
  schema: z.object({
    threadId: z.string(),
    message: z.object({
      id: z.string(),
      threadId: z.string(),
      senderKind: z.enum(["user", "guest"]),
      senderId: z.string(),
      body: z.string(),
      tagIds: z.array(z.string()),
      createdAt: z.string(),
    }),
    participantUserIds: z.array(z.string()),
    participantGuestIds: z.array(z.string()),
  }),
  delivery: DeliveryMode.Realtime,
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
      tagIds: z.array(z.string()),
      createdAt: z.string(),
    }),
  }),
  delivery: DeliveryMode.Realtime,
});
