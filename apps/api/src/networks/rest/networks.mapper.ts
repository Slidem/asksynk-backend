import { Invite } from "@/api/networks/entities/invite.entity";
import { NetworkConnection } from "@/api/networks/entities/network-connection.entity";
import { InviteResponseDto } from "@/api/networks/rest/responses/invite.response";
import { NetworkConnectionResponseDto } from "@/api/networks/rest/responses/network-connection.response";

export function toInviteResponseDto(invite: Invite): InviteResponseDto {
  return {
    id: invite.id,
    inviterUserId: invite.inviterUserId,
    inviteeEmail: invite.inviteeEmail,
    status: invite.status,
    createdAt: invite.createdAt.toISOString(),
    updatedAt: invite.updatedAt.toISOString(),
  };
}

export function toNetworkConnectionResponseDto(
  connection: NetworkConnection,
): NetworkConnectionResponseDto {
  return {
    userId: connection.connectionId,
    name: connection.name,
    firstName: connection.firstName,
    lastName: connection.lastName,
    email: connection.email,
    image: connection.image,
    connectedAt: connection.connectedAt.toISOString(),
  };
}
