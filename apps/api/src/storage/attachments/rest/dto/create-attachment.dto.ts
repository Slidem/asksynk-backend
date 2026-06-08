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
  AttachmentPlacement,
  MAX_ATTACHMENT_BYTES,
} from "@/api/storage/attachments/models/attachment.model";

export class CreateAttachmentDto {
  @IsIn(["public", "message"])
  placement!: AttachmentPlacement;

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
