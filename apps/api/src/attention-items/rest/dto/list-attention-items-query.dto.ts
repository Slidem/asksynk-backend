import { IsIn, IsOptional, IsString } from "class-validator";

import { AttentionItemStatus, AttentionItemType } from "@/api/attention-items/models/attention-item.model";

export class ListAttentionItemsQueryDto {
  @IsOptional()
  @IsIn(["created", "in_progress", "resolved"])
  status?: AttentionItemStatus;

  @IsOptional()
  @IsIn([
    "tagged_message",
    "incoming_email",
    "slack_message",
    "whatsapp_message",
    "suggested_timeblock",
    "suggested_task",
    "task",
  ])
  type?: AttentionItemType;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
