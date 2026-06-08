import { IsIn } from "class-validator";

export class FinalizeAttachmentDto {
  @IsIn(["ready"])
  status!: "ready";
}
