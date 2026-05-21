import { IsArray, IsIn, IsOptional, IsString } from "class-validator";

import { AttentionItemStatus } from "@/api/attention-items/models/attention-item.model";
import { IsUuidV7 } from "@/api/common/decorators/validators";

export class PatchAttentionItemDto {
  @IsOptional()
  @IsIn(["created", "in_progress", "resolved"])
  status?: AttentionItemStatus;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsArray()
  @IsUuidV7({ each: true })
  tagIds?: string[];
}
