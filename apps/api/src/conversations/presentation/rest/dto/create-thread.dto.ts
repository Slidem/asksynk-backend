import { IsString } from "class-validator";

export class CreateThreadRequestDto {
  @IsString()
  recipientUserId!: string;
}
