import { Injectable, OnModuleInit } from "@nestjs/common";

import { MessageAttachmentRepository } from "@/api/messaging/domain/ports/message-attachment.repository";
import {
  AttachmentAccessPort,
  AttachmentActor,
  AttachmentPermissionResolver,
} from "@/api/storage/contract/attachment-access.port";

/**
 * The "message" placement read-authz (thread participation). Registers itself on the
 * storage access registry at bootstrap.
 */
@Injectable()
export class MessageAttachmentResolver
  implements AttachmentPermissionResolver, OnModuleInit
{
  readonly placement = "message" as const;

  constructor(
    private readonly access: AttachmentAccessPort,
    private readonly repo: MessageAttachmentRepository,
  ) {}

  onModuleInit(): void {
    this.access.register(this);
  }

  async canRead(attachmentId: string, actor: AttachmentActor): Promise<boolean> {
    return this.repo.userCanReachAttachment(attachmentId, actor.userId);
  }
}
