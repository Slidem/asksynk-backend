import { Injectable } from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";

import {
  AttachmentAccessPort,
  AttachmentActor,
  AttachmentPermissionResolver,
} from "@/api/files/contract/attachment-access.port";
import { AttachmentPlacement } from "@/api/files/contract/attachment-catalog.port";
import { Attachment } from "@/api/files/domain/attachment";

/**
 * Registry + dispatcher for per-placement read authorization. Feature resolvers register
 * themselves here at bootstrap (runtime registration, not DI multi-providers — keeps the
 * dependency direction feature → storage and avoids cross-module provider aggregation).
 */
@Injectable()
export class AttachmentAccessService extends AttachmentAccessPort {
  private readonly logger = new ContextLogger(AttachmentAccessService.name);
  private readonly resolvers = new Map<
    AttachmentPlacement,
    AttachmentPermissionResolver
  >();

  register(resolver: AttachmentPermissionResolver): void {
    this.resolvers.set(resolver.placement, resolver);
    this.logger.info("Registered attachment resolver", {
      placement: resolver.placement,
    });
  }

  async canRead(
    attachment: Attachment,
    actor: AttachmentActor,
  ): Promise<boolean> {
    // Public blobs are world-readable by definition.
    if (attachment.placement === "public") {
      return true;
    }
    // The uploader can always read their own blob (covers the uploaded-but-not-yet-linked
    // draft state, before it is attached to any resource).
    if (attachment.isOwnedBy(actor.userId)) {
      return true;
    }
    const resolver = this.resolvers.get(attachment.placement);
    if (!resolver) {
      this.logger.warn("No resolver for placement; denying", {
        placement: attachment.placement,
      });
      return false;
    }
    return resolver.canRead(attachment.id, actor);
  }
}
