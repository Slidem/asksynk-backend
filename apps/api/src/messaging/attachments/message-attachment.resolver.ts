import { Injectable, OnModuleInit } from "@nestjs/common";

import { AsksynkError } from "@/api/common/errors/errors.model";
import { MessageAttachmentRepository } from "@/api/messaging/attachments/message-attachment.repository";
import { AttachmentAccessService } from "@/api/storage/attachment-access.service";
import { AttachmentPermissionResolver } from "@/api/storage/attachment-permission-resolver";
import { Attachment } from "@/api/storage/attachments/entities/attachment.entity";
import { AttachmentActor } from "@/api/storage/attachments/models/attachment.model";
import { AttachmentsRepository } from "@/api/storage/attachments/repositories/attachments.repository";

/**
 * The "message" placement micro-module: owns read-authz (thread participation) and the
 * linkability gate. Registers itself on the AttachmentAccessService at bootstrap.
 */
@Injectable()
export class MessageAttachmentResolver
  implements AttachmentPermissionResolver, OnModuleInit
{
  readonly placement = "message" as const;

  constructor(
    private readonly access: AttachmentAccessService,
    private readonly repo: MessageAttachmentRepository,
    private readonly attachmentsRepository: AttachmentsRepository,
  ) {}

  onModuleInit(): void {
    this.access.register(this);
  }

  async canRead(
    attachment: Attachment,
    actor: AttachmentActor,
  ): Promise<boolean> {
    return this.repo.userCanReachAttachment(attachment.id, actor.userId);
  }

  /**
   * Authz gate run before attaching blobs to a message on send: each must be owned by the
   * sender, finalized (`active`), and declared for the `message` placement.
   */
  async assertLinkable(
    attachmentIds: string[],
    senderUserId: string,
  ): Promise<void> {
    if (attachmentIds.length === 0) {
      return;
    }
    const found = await this.attachmentsRepository.getByIds(attachmentIds);
    const byId = new Map(found.map((a) => [a.id, a] as const));
    for (const id of attachmentIds) {
      const attachment = byId.get(id);
      if (
        !attachment ||
        !attachment.isOwnedBy(senderUserId) ||
        !attachment.isActive() ||
        attachment.placement !== "message"
      ) {
        throw AsksynkError.badRequest("Invalid attachment");
      }
    }
  }
}
