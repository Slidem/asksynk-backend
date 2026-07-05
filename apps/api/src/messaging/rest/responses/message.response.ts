import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AttachmentResponseDto } from "src/storage/attachments/rest/responses/attachment.response";

import {
  MANAGED_MESSAGE_STATUSES,
  ManagedMessageStatus,
} from "@/api/messaging/entities/message.entity";

export const SENDER_KINDS = ["user", "guest"] as const;
export type SenderKind = (typeof SENDER_KINDS)[number];

export class ManagedStatusDto {
  @ApiProperty({ enum: ["tagged_message"] })
  type!: "tagged_message";

  @ApiProperty({ enum: [...MANAGED_MESSAGE_STATUSES] })
  status!: ManagedMessageStatus;
}

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

  // Present only on tagged messages; omitted otherwise (not manageable).
  @ApiPropertyOptional({ type: ManagedStatusDto })
  managedStatus?: ManagedStatusDto;

  createdAt!: string;
}

export class ThreadMessageResponseDto extends MessageResponseDto {
  replyCount!: number;
}
