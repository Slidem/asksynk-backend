import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("networks", {
  inviter_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Inviter with id { inviterUserId } not found",
  },
  cannot_invite_self: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "Cannot invite yourself",
  },
  already_connected: {
    category: DomainErrorCategory.CONFLICT,
    exposable: true,
    message: "Already connected to user { inviteeUserId }",
  },
  invite_already_pending: {
    category: DomainErrorCategory.CONFLICT,
    exposable: true,
    message: "A pending invite already exists for { email }",
  },
  invite_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Invite with id { inviteId } not found",
  },
  invite_email_mismatch: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Invite { inviteId } is for a different email",
  },
  invite_not_pending: {
    category: DomainErrorCategory.CONFLICT,
    exposable: true,
    message: "Invite { inviteId } is not pending",
  },
  network_connection_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Network connection with user { userId } not found",
  },
});

export const networksCatalog = catalog;
export const networksError = createError;
