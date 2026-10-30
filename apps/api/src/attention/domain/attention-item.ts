import { AttentionItemStatus } from "@/api/attention/contract/attention-item-status.public";

// Identity of the thing the item projects; opaque to attention beyond equality.
export type AttentionSource = { context: string; kind: string; id: string };

// Display only. `meta` is stored and returned verbatim, never read or queried.
export type AttentionPreview = {
  title: string;
  body: string | null;
  actor: { kind: "user" | "guest"; id: string } | null;
  meta: Record<string, string>;
};

// Every column attention writes on an upsert (never `deletedAt`).
export interface AttentionItemState {
  userId: string;
  source: AttentionSource;
  preview: AttentionPreview;
  status: AttentionItemStatus;
  tagIds: string[];
  dueDate: Date | null;
  dueDatePinned: boolean;
  dueSourceEventId: string | null;
}

export interface AttentionItemProps extends AttentionItemState {
  id: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListAttentionItemsInput {
  status?: AttentionItemStatus;
  sourceKind?: string;
  limit?: number;
  cursor?: string;
}

// Read model: a projection of its source plus derived due date. No setters —
// state changes only through `applySnapshot` and the due-date recompute.
export class AttentionItem implements AttentionItemProps {
  readonly id: string;
  readonly userId: string;
  readonly source: AttentionSource;
  readonly preview: AttentionPreview;
  readonly status: AttentionItemStatus;
  readonly tagIds: string[];
  readonly dueDate: Date | null;
  readonly dueDatePinned: boolean;
  readonly dueSourceEventId: string | null;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: AttentionItemProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.source = props.source;
    this.preview = props.preview;
    this.status = props.status;
    this.tagIds = props.tagIds;
    this.dueDate = props.dueDate;
    this.dueDatePinned = props.dueDatePinned;
    this.dueSourceEventId = props.dueSourceEventId;
    this.deletedAt = props.deletedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: AttentionItemProps): AttentionItem {
    return new AttentionItem(props);
  }

  belongsTo(userId: string): boolean {
    return this.userId === userId;
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}
