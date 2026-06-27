import { ApiProperty } from "@nestjs/swagger";
import { AttachmentResponseDto } from "src/storage/attachments/rest/responses/attachment.response";

export const SENDER_KINDS = ["user", "guest"] as const;
export type SenderKind = (typeof SENDER_KINDS)[number];

export class MessageResponseDto {
  id!: string;
  threadId!: string;
  parentMessageId!: string | null;

  @ApiProperty({ enum: [...SENDER_KINDS], enumName: "SenderKind" })
  senderKind!: SenderKind;

  senderId!: string;
  body!: string;
  tagIds!: string[];
  attachments!: AttachmentResponseDto[];
  suggestionId!: string | null;
  createdAt!: string;
}

export class ThreadMessageResponseDto extends MessageResponseDto {
  replyCount!: number;
}
