export const USER_NOTIFICATION_EVENT = "user-notification";

export type UserNotificationPayload = {
  userId: string;
  type: string;
  payload: unknown;
};
export type Ack = { ok: true } | { ok: false; error: string };
export type SendAck =
  | { ok: true; messageId: string; suggestionId?: string | null }
  | { ok: false; error: string };
