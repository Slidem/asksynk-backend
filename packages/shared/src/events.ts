export type TagEventPayload = {
  id: string;
  userId: string;
  name: string;
};

export const TagEvent = {
  Created: "tag.created",
  Updated: "tag.updated",
} as const;

export type TagEvent = (typeof TagEvent)[keyof typeof TagEvent];

export const TAG_EVENTS_EMAIL_QUEUE = "tag-events.email";
