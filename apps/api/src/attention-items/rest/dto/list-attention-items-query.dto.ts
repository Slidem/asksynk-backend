import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

import {
  ATTENTION_ITEM_STATUSES,
  ATTENTION_ITEM_TYPES,
  AttentionItemStatus,
  AttentionItemType,
} from "@/api/attention-items/models/attention-item.model";

export class ListAttentionItemsQueryDto {
  @ApiPropertyOptional({
    enum: [...ATTENTION_ITEM_STATUSES],
    enumName: "AttentionItemStatus",
  })
  @IsOptional()
  @IsIn(ATTENTION_ITEM_STATUSES)
  status?: AttentionItemStatus;

  @ApiPropertyOptional({
    enum: [...ATTENTION_ITEM_TYPES],
    enumName: "AttentionItemType",
  })
  @IsOptional()
  @IsIn(ATTENTION_ITEM_TYPES)
  type?: AttentionItemType;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
