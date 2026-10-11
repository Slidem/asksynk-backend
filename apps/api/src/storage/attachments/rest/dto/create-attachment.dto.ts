import { ApiProperty } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import {
  ALLOWED_CONTENT_TYPES,
  MAX_ATTACHMENT_BYTES,
} from "@/api/storage/attachments/models/attachment.model";
import {
  ATTACHMENT_PLACEMENTS,
  AttachmentPlacement,
} from "@/api/storage/contract/attachment-catalog.port";

export class CreateAttachmentDto {
  @ApiProperty({
    enum: [...ATTACHMENT_PLACEMENTS],
    enumName: "AttachmentPlacement",
  })
  @IsIn(ATTACHMENT_PLACEMENTS)
  placement!: AttachmentPlacement;

  @ApiProperty({ enum: [...ALLOWED_CONTENT_TYPES] })
  @IsIn([...ALLOWED_CONTENT_TYPES])
  contentType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsInt()
  @Min(1)
  @Max(MAX_ATTACHMENT_BYTES)
  sizeBytes!: number;
}
