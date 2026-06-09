import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import { ContextLogger } from "nestjs-context-logger";

import { AsksynkError } from "@/api/common/errors/errors.model";
import { Attachment } from "@/api/storage/attachments/entities/attachment.entity";
import { AttachmentsRepository } from "@/api/storage/attachments/repositories/attachments.repository";
import { AttachmentsService } from "@/api/storage/attachments/services/attachments.service";
import { UserProfile } from "@/api/user-profile/entities/user-profile.entity";
import { UpdateUserProfileInput } from "@/api/user-profile/models/update-user-profile.model";
import { UserProfileRepository } from "@/api/user-profile/repositories/user-profile.repository";

@Injectable()
export class UserProfileService {
  private readonly logger = new ContextLogger(UserProfileService.name);

  constructor(
    private readonly userProfileRepository: UserProfileRepository,
    private readonly attachmentsService: AttachmentsService,
    private readonly attachmentsRepository: AttachmentsRepository,
  ) {}

  @Transactional()
  async getProfile(userId: string): Promise<UserProfile> {
    const profile = await this.userProfileRepository.getById(userId);
    if (!profile) {
      throw AsksynkError.notFound("User profile not found");
    }
    return profile;
  }

  @Transactional()
  async updateProfile(input: UpdateUserProfileInput): Promise<UserProfile> {
    const profile = await this.userProfileRepository.getById(input.userId);
    if (!profile) {
      throw AsksynkError.notFound("User profile not found");
    }

    if (input.phone !== undefined) {
      profile.phone = input.phone;
    }

    // Materialize the avatar's public url into `image` once, at write time. The
    // attachment id is only an input (which uploaded blob to use); we store the url.
    if (input.avatarAttachmentId !== undefined) {
      if (input.avatarAttachmentId === null) {
        profile.image = null;
      } else {
        const attachment = await this.loadUsableAvatar(
          input.userId,
          input.avatarAttachmentId,
        );
        profile.image =
          this.attachmentsService.publicUrlForAttachment(attachment);
      }
    }

    return this.userProfileRepository.update(profile);
  }

  /** Avatar must be a public, finalized attachment owned by the same user. */
  private async loadUsableAvatar(
    userId: string,
    attachmentId: string,
  ): Promise<Attachment> {
    const attachment = await this.attachmentsRepository.getById(attachmentId);
    if (
      !attachment ||
      !attachment.isOwnedBy(userId) ||
      attachment.placement !== "public" ||
      !attachment.isActive()
    ) {
      throw AsksynkError.badRequest("Invalid avatar attachment");
    }
    return attachment;
  }
}
