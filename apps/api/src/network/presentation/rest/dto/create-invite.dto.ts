import { IsEmail } from "class-validator";

export class CreateInviteRequestDto {
  @IsEmail()
  email!: string;
}
