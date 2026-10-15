import { IsNotEmpty, IsString } from "class-validator";

import { IsIdList } from "@/api/conversations/presentation/ws/dto/id-list.decorator";

export class TagMessageDto {
  @IsString({ message: "messageId required" })
  @IsNotEmpty({ message: "messageId required" })
  messageId!: string;

  @IsIdList("tagIds")
  tagIds?: string[];
}
