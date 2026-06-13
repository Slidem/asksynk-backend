import {
  AttentionItemMetadata,
  AttentionItemStatus,
  AttentionItemType,
} from "@/api/attention-items/models/attention-item.model";

export interface AttentionItemProps {
  id: string;
  userId: string;
  type: AttentionItemType;
  status: AttentionItemStatus;
  dueDate: Date | null;
  dueDatePinned: boolean;
  note: string | null;
  metadata: AttentionItemMetadata;
  tagIds: string[];
  sourceCalendarEventId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AttentionItem {
  readonly id: string;
  readonly userId: string;
  readonly type: AttentionItemType;
  status: AttentionItemStatus;
  dueDate: Date | null;
  readonly dueDatePinned: boolean;
  note: string | null;
  readonly metadata: AttentionItemMetadata;
  tagIds: string[];
  sourceCalendarEventId: string | null;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: AttentionItemProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.type = props.type;
    this.status = props.status;
    this.dueDate = props.dueDate;
    this.dueDatePinned = props.dueDatePinned;
    this.note = props.note;
    this.metadata = props.metadata;
    this.tagIds = props.tagIds;
    this.sourceCalendarEventId = props.sourceCalendarEventId;
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
