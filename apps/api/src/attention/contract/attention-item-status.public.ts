export const ATTENTION_ITEM_STATUSES = [
  "created",
  "in_progress",
  "resolved",
] as const;

export type AttentionItemStatus = (typeof ATTENTION_ITEM_STATUSES)[number];
