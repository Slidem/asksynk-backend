import { Invite, InviteStatus } from "@/api/network/domain/invite";

export abstract class InvitesRepository {
  abstract add(input: {
    id: string;
    inviterUserId: string;
    inviteeEmail: string;
  }): Promise<Invite>;
  abstract getById(id: string): Promise<Invite | null>;
  abstract updateStatus(id: string, status: InviteStatus): Promise<Invite | null>;
  abstract listForInviter(inviterUserId: string): Promise<Invite[]>;
  abstract listForInviteeEmail(email: string): Promise<Invite[]>;
  abstract findPending(
    inviterUserId: string,
    inviteeEmail: string,
  ): Promise<Invite | null>;
}
