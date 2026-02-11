export type TagEventPayload = {
  id: string;
  userId: string;
  name: string;
};

export const TagEventSubject = {
  Created: "tags.created",
  Updated: "tags.updated",
} as const;

export type TagEventSubject =
  (typeof TagEventSubject)[keyof typeof TagEventSubject];
