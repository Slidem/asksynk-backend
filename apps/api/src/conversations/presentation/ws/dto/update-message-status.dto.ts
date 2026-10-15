import { IsIn, IsNotEmpty, IsString } from "class-validator";

import {
  MANAGED_MESSAGE_STATUSES,
  ManagedMessageStatus,
} from "@/api/conversations/domain/message";

export class UpdateMessageStatusDto {
  @IsString({ message: "messageId required" })
  @IsNotEmpty({ message: "messageId required" })
  messageId!: string;

  @IsIn(MANAGED_MESSAGE_STATUSES, {
    message: `status must be one of ${MANAGED_MESSAGE_STATUSES.join(", ")}`,
  })
  status!: ManagedMessageStatus;
}
