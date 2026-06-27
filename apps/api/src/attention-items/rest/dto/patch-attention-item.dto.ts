import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsIn, IsOptional, IsString } from "class-validator";

import {
  ATTENTION_ITEM_STATUSES,
  AttentionItemStatus,
} from "@/api/attention-items/models/attention-item.model";
import { IsUuidV7 } from "@/api/common/decorators/validators";

export class PatchAttentionItemDto {
  @ApiPropertyOptional({
    enum: [...ATTENTION_ITEM_STATUSES],
    enumName: "AttentionItemStatus",
  })
  @IsOptional()
  @IsIn(ATTENTION_ITEM_STATUSES)
  status?: AttentionItemStatus;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsArray()
  @IsUuidV7({ each: true })
  tagIds?: string[];
}
