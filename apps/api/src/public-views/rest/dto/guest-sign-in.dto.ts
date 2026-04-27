import { IsString, MaxLength, MinLength } from "class-validator";

export class GuestSignInRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;
}
