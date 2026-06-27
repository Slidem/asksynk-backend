import { ApiProperty } from "@nestjs/swagger";

import {
  ATTENTION_ITEM_STATUSES,
  ATTENTION_ITEM_TYPES,
  AttentionItemStatus,
  AttentionItemType,
} from "@/api/attention-items/models/attention-item.model";

export class AttentionItemMetadataDto {
  @ApiProperty({
    enum: [...ATTENTION_ITEM_TYPES],
    enumName: "AttentionItemType",
  })
  type!: AttentionItemType;

  messageId?: string;
  threadId?: string;
  senderId?: string;
  senderType?: "user" | "guest";
  content?: string;
  originalTagIds?: string[];
  title?: string;
  taskId?: string;
  taskBatchId?: string;
  suggestionId?: string;
  suggesterUserId?: string;
}

export class AttentionItemResponse {
  id!: string;
  userId!: string;

  @ApiProperty({
    enum: [...ATTENTION_ITEM_TYPES],
    enumName: "AttentionItemType",
  })
  type!: AttentionItemType;

  @ApiProperty({
    enum: [...ATTENTION_ITEM_STATUSES],
    enumName: "AttentionItemStatus",
  })
  status!: AttentionItemStatus;

  dueDate!: string | null;
  note!: string | null;
  metadata!: AttentionItemMetadataDto;
  tagIds!: string[];
  sourceCalendarEventId!: string | null;
  createdAt!: string;
  updatedAt!: string;
}
