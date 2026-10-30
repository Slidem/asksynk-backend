import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

import { ATTENTION_ITEM_STATUSES, AttentionItemStatus } from "@/api/attention/contract/attention-item-status.public";

export class ListAttentionItemsQueryDto {
  @ApiPropertyOptional({
    enum: [...ATTENTION_ITEM_STATUSES],
    enumName: "AttentionItemStatus",
  })
  @IsOptional()
  @IsIn(ATTENTION_ITEM_STATUSES)
  status?: AttentionItemStatus;

  /** e.g. message, task, task_batch, task_suggestion */
  @IsOptional()
  @IsString()
  sourceKind?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
