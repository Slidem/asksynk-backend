import { AttachmentResponseDto } from "src/storage/attachments/rest/responses/attachment.response";

export interface MessageResponseDto {
  id: string;
  threadId: string;
  parentMessageId: string | null;
  senderKind: "user" | "guest";
  senderId: string;
  body: string;
  tagIds: string[];
  attachments: AttachmentResponseDto[];
  createdAt: string;
}

export interface ThreadMessageResponseDto extends MessageResponseDto {
  replyCount: number;
}
