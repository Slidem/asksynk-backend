import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

export class FinalizeAttachmentDto {
  @ApiProperty({ enum: ["ready"] })
  @IsIn(["ready"])
  status!: "ready";
}
