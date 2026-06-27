import { ApiExtraModels, ApiProperty, getSchemaPath } from "@nestjs/swagger";

import {
  SENDER_KINDS,
  SenderKind,
} from "@/api/messaging/rest/responses/message.response";

export class ThreadUserParticipantDto {
  @ApiProperty({ enum: ["user"] })
  kind!: "user";
  userId!: string;
  name!: string | null;
  firstName!: string | null;
  lastName!: string | null;
  email!: string;
  image!: string | null;
  isActiveConnection!: boolean;
}

export class ThreadGuestParticipantDto {
  @ApiProperty({ enum: ["guest"] })
  kind!: "guest";
  guestId!: string;
  displayName!: string;
  publicViewId!: string;
  publicViewName!: string | null;
  publicViewExpired!: boolean;
}

export type ThreadOtherParticipantDto =
  | ThreadUserParticipantDto
  | ThreadGuestParticipantDto;

export class ThreadLastMessageDto {
  body!: string;
  createdAt!: string;

  @ApiProperty({ enum: [...SENDER_KINDS], enumName: "SenderKind" })
  senderKind!: SenderKind;
}

@ApiExtraModels(ThreadUserParticipantDto, ThreadGuestParticipantDto)
export class ThreadListItemResponseDto {
  threadId!: string;
  publicViewId!: string | null;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(ThreadUserParticipantDto) },
      { $ref: getSchemaPath(ThreadGuestParticipantDto) },
    ],
    discriminator: { propertyName: "kind" },
  })
  other!: ThreadOtherParticipantDto;

  lastMessage!: ThreadLastMessageDto | null;

  frozen!: boolean;
  createdAt!: string;
}

export class CreateThreadResponseDto {
  threadId!: string;
}
