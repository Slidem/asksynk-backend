import { ApiProperty } from "@nestjs/swagger";

import {
  INVITE_STATUSES,
  InviteStatus,
} from "@/api/networks/entities/invite.entity";

export class InviteResponseDto {
  id!: string;
  inviterUserId!: string;
  inviteeEmail!: string;

  @ApiProperty({ enum: [...INVITE_STATUSES], enumName: "InviteStatus" })
  status!: InviteStatus;

  createdAt!: string;
  updatedAt!: string;
}
