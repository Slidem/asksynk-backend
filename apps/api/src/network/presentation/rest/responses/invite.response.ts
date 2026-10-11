import { ApiProperty } from "@nestjs/swagger";

import {
  INVITE_STATUSES,
  InviteStatus,
} from "@/api/network/domain/invite";

export class InviteResponseDto {
  id!: string;
  inviterUserId!: string;
  inviteeEmail!: string;

  @ApiProperty({ enum: [...INVITE_STATUSES], enumName: "InviteStatus" })
  status!: InviteStatus;

  createdAt!: string;
  updatedAt!: string;
}
