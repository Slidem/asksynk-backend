import { InviteStatus } from "@/api/networks/entities/invite.entity";

export interface InviteResponseDto {
  id: string;
  inviterUserId: string;
  inviteeEmail: string;
  status: InviteStatus;
  createdAt: string;
  updatedAt: string;
}
