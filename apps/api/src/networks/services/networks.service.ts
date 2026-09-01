import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Transactional } from "@nestjs-cls/transactional";
import { ContextLogger } from "nestjs-context-logger";
import { generateId } from "src/kernel/id";
import { EmailService } from "src/platform/email/email.service";

import { RequestActor } from "@/api/auth/auth.types";
import { Invite } from "@/api/networks/entities/invite.entity";
import { NetworkConnection } from "@/api/networks/entities/network-connection.entity";
import { networksError } from "@/api/networks/networks.errors";
import { InvitesRepository } from "@/api/networks/repositories/invites.repository";
import { NetworkRepository } from "@/api/networks/repositories/network.repository";
import { UsersLookupRepository } from "@/api/networks/repositories/users-lookup.repository";

@Injectable()
export class NetworksService {
  private readonly logger = new ContextLogger(NetworksService.name);

  constructor(
    private readonly invitesRepository: InvitesRepository,
    private readonly networkRepository: NetworkRepository,
    private readonly usersLookupRepository: UsersLookupRepository,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  @Transactional()
  async createInvite(
    inviterUserId: string,
    inviteeEmail: string,
  ): Promise<Invite> {
    const normalized = inviteeEmail.toLowerCase().trim();

    const inviter = await this.usersLookupRepository.getById(inviterUserId);

    if (!inviter) {
      throw networksError("inviter_not_found", { inviterUserId });
    }

    if (inviter.email.toLowerCase() === normalized) {
      throw networksError("cannot_invite_self");
    }

    const invitee = await this.usersLookupRepository.getByEmail(normalized);

    if (invitee) {
      const alreadyConnected = await this.networkRepository.isActiveConnection(
        inviterUserId,
        invitee.id,
      );
      if (alreadyConnected) {
        throw networksError("already_connected", { inviteeUserId: invitee.id });
      }
    }

    const existing = await this.invitesRepository.findPending(
      inviterUserId,
      normalized,
    );

    if (existing) {
      throw networksError("invite_already_pending", { email: normalized });
    }

    const invite = await this.invitesRepository.add({
      id: generateId(),
      inviterUserId,
      inviteeEmail: normalized,
    });

    this.sendInviteEmail(inviter, invite).catch((err) => {
      this.logger.error("Failed to send invite email", {
        err,
        inviteId: invite.id,
      });
    });

    return invite;
  }

  async listSent(inviterUserId: string): Promise<Invite[]> {
    return this.invitesRepository.listForInviter(inviterUserId);
  }

  async listReceived(email: string): Promise<Invite[]> {
    return this.invitesRepository.listForInviteeEmail(email);
  }

  @Transactional()
  async acceptInvite(
    inviteId: string,
    acceptingUser: { id: string; email: string },
  ): Promise<Invite> {
    const invite = await this.invitesRepository.getById(inviteId);

    if (!invite) {
      throw networksError("invite_not_found", { inviteId });
    }

    if (!invite.isForEmail(acceptingUser.email)) {
      throw networksError("invite_email_mismatch", { inviteId });
    }

    if (!invite.isPending()) {
      throw networksError("invite_not_pending", { inviteId });
    }

    const updated = await this.invitesRepository.updateStatus(
      inviteId,
      "accepted",
    );

    if (!updated) {
      throw networksError("invite_not_found", { inviteId });
    }

    await this.networkRepository.upsertPair(
      invite.inviterUserId,
      acceptingUser.id,
    );
    return updated;
  }

  @Transactional()
  async rejectInvite(
    inviteId: string,
    acceptingUser: { email: string },
  ): Promise<Invite> {
    const invite = await this.invitesRepository.getById(inviteId);
    if (!invite) {
      throw networksError("invite_not_found", { inviteId });
    }

    if (!invite.isForEmail(acceptingUser.email)) {
      throw networksError("invite_email_mismatch", { inviteId });
    }

    if (!invite.isPending()) {
      throw networksError("invite_not_pending", { inviteId });
    }

    const updated = await this.invitesRepository.updateStatus(
      inviteId,
      "rejected",
    );

    if (!updated) {
      throw networksError("invite_not_found", { inviteId });
    }

    return updated;
  }

  async listConnections(userId: string): Promise<NetworkConnection[]> {
    return this.networkRepository.listActiveConnections(userId);
  }

  @Transactional()
  async removeConnection(userId: string, connectionId: string): Promise<void> {
    await this.networkRepository.softRemovePair(userId, connectionId);
  }

  isActiveConnection(userIdA: string, userIdB: string): Promise<boolean> {
    return this.networkRepository.isActiveConnection(userIdA, userIdB);
  }

  async validateIsActiveConnection(
    userIdA: string,
    userIdB: string,
  ): Promise<void> {
    const isActive = await this.networkRepository.isActiveConnection(
      userIdA,
      userIdB,
    );

    if (!isActive) {
      throw networksError("network_connection_not_found", { userId: userIdB });
    }
  }

  async resolveTargetUserId(
    actor: RequestActor,
    requestedUserId?: string,
  ): Promise<string> {
    if (actor.isGuest) {
      return actor.guest.ownerUserId;
    }
    if (!requestedUserId || requestedUserId === actor.user.id) {
      return actor.user.id;
    }
    await this.validateIsActiveConnection(actor.user.id, requestedUserId);
    return requestedUserId;
  }

  private async sendInviteEmail(
    inviter: {
      name: string | null;
      firstName: string | null;
      lastName: string | null;
    },
    invite: Invite,
  ): Promise<void> {
    const appBaseUrl = this.configService.getOrThrow<string>("APP_BASE_URL");
    const acceptUrl = `${appBaseUrl}/invites/${invite.id}`;
    const inviterName =
      inviter.name ??
      [inviter.firstName, inviter.lastName].filter(Boolean).join(" ").trim() ??
      "A user";

    await this.emailService.send({
      to: invite.inviteeEmail,
      template: {
        type: "network-invite",
        inviterName: inviterName || "A user",
        acceptUrl,
      },
    });
  }
}
