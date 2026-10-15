import { IsNotEmpty, IsString } from "class-validator";

export class ThreadSubscriptionDto {
  @IsString({ message: "threadId required" })
  @IsNotEmpty({ message: "threadId required" })
  threadId!: string;
}
