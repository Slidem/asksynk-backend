import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class UpdateUserProfileRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @IsOptional()
  @IsUUID()
  avatarAttachmentId?: string | null;
}
