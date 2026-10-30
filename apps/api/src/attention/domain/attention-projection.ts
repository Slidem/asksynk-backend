import { AttentionItemStatus } from "@/api/attention/contract/attention-item-status.public";
import {
  AttentionItem,
  AttentionItemState,
  AttentionPreview,
  AttentionSource,
} from "@/api/attention/domain/attention-item";
import { DueDateDecision } from "@/api/attention/domain/due-date.policy";

// What a source says about one item for one user (attention.source.upserted).
export type AttentionSourceSnapshot = {
  userId: string;
  source: AttentionSource;
  preview: AttentionPreview;
  tagIds: string[];
  status: AttentionItemStatus;
  // Non-null = explicit; pins the item.
  dueDate: Date | null;
  // Due-date policy base.
  occurredAt: Date;
};

/** Next state of the item, or null when nothing changes (no write, no realtime push).
 *  A tombstoned item stays as it is: a user delete is permanent. `decision` is the
 *  policy's answer for the snapshot's tags; ignored when the snapshot pins a date. */
export function applySnapshot(
  current: AttentionItem | null,
  snapshot: AttentionSourceSnapshot,
  decision: DueDateDecision,
): AttentionItemState | null {
  if (current?.isDeleted) return null;

  const next: AttentionItemState = {
    userId: snapshot.userId,
    source: snapshot.source,
    preview: snapshot.preview,
    status: snapshot.status,
    tagIds: snapshot.tagIds,
    ...(snapshot.dueDate
      ? {
          dueDate: snapshot.dueDate,
          dueDatePinned: true,
          dueSourceEventId: null,
        }
      : {
          dueDate: decision.dueDate,
          dueDatePinned: false,
          dueSourceEventId: decision.dueSourceEventId,
        }),
  };

  if (current && sameState(current, next)) return null;
  return next;
}

function sameState(a: AttentionItemState, b: AttentionItemState): boolean {
  return (
    a.status === b.status &&
    a.dueDatePinned === b.dueDatePinned &&
    a.dueSourceEventId === b.dueSourceEventId &&
    (a.dueDate?.getTime() ?? null) === (b.dueDate?.getTime() ?? null) &&
    sameSet(a.tagIds, b.tagIds) &&
    samePreview(a.preview, b.preview)
  );
}

function sameSet(a: string[], b: string[]): boolean {
  const set = new Set(a);
  return a.length === b.length && b.every((x) => set.has(x));
}

function samePreview(a: AttentionPreview, b: AttentionPreview): boolean {
  const aMeta = Object.entries(a.meta);
  return (
    a.title === b.title &&
    a.body === b.body &&
    a.actor?.kind === b.actor?.kind &&
    a.actor?.id === b.actor?.id &&
    aMeta.length === Object.keys(b.meta).length &&
    aMeta.every(([k, v]) => b.meta[k] === v)
  );
}
