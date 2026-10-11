import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class CreatePublicViewRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
