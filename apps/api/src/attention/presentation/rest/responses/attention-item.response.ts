import { ApiProperty } from "@nestjs/swagger";

import { ATTENTION_ITEM_STATUSES, AttentionItemStatus } from "@/api/attention/contract/attention-item-status.public";

export class AttentionSourceDto {
  /** Owning context, e.g. conversations, tasks */
  context!: string;
  /** e.g. message, task, task_batch, task_suggestion */
  kind!: string;
  id!: string;
}

export class AttentionActorDto {
  @ApiProperty({ enum: ["user", "guest"] })
  kind!: "user" | "guest";

  id!: string;
}

export class AttentionPreviewDto {
  title!: string;
  body!: string | null;
  actor!: AttentionActorDto | null;

  /** Source-specific display / navigation extras, e.g. { threadId } for a message */
  @ApiProperty({
    type: "object",
    additionalProperties: { type: "string" },
  })
  meta!: Record<string, string>;
}

export class AttentionItemResponse {
  id!: string;
  userId!: string;
  source!: AttentionSourceDto;
  preview!: AttentionPreviewDto;

  @ApiProperty({
    enum: [...ATTENTION_ITEM_STATUSES],
    enumName: "AttentionItemStatus",
  })
  status!: AttentionItemStatus;

  tagIds!: string[];
  dueDate!: string | null;
  dueDatePinned!: boolean;
  createdAt!: string;
  updatedAt!: string;
}
