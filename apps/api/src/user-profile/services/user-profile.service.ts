import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import { pick, pickBy } from "lodash";
import { ContextLogger } from "nestjs-context-logger";

import { AsksynkError } from "@/api/common/errors/errors.model";
import { AttachmentsRepository } from "@/api/storage/attachments/repositories/attachments.repository";
import { AttachmentsService } from "@/api/storage/attachments/services/attachments.service";
import { UserProfile } from "@/api/user-profile/entities/user-profile.entity";
import { UpdateUserProfileInput } from "@/api/user-profile/models/update-user-profile.model";
import { ResolvedUserProfile } from "@/api/user-profile/models/user-profile.model";
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
  async getProfile(userId: string): Promise<ResolvedUserProfile> {
    const profile = await this.userProfileRepository.getById(userId);
    if (!profile) {
      throw AsksynkError.notFound("User profile not found");
    }
    return this.resolve(profile);
  }

  @Transactional()
  async updateProfile(
    input: UpdateUserProfileInput,
  ): Promise<ResolvedUserProfile> {
    const profile = await this.userProfileRepository.getById(input.userId);
    if (!profile) {
      throw AsksynkError.notFound("User profile not found");
    }

    if (input.avatarAttachmentId) {
      await this.assertUsableAvatar(input.userId, input.avatarAttachmentId);
    }

    const updates = pickBy(
      pick(input, ["phone", "avatarAttachmentId"]),
      (v) => v !== undefined,
    );
    Object.assign(profile, updates);

    const updated = await this.userProfileRepository.update(profile);
    return this.resolve(updated);
  }

  /** Avatar must be a public, finalized attachment owned by the same user. */
  private async assertUsableAvatar(
    userId: string,
    attachmentId: string,
  ): Promise<void> {
    const attachment = await this.attachmentsRepository.getById(attachmentId);
    if (
      !attachment ||
      !attachment.isOwnedBy(userId) ||
      attachment.placement !== "public" ||
      !attachment.isActive()
    ) {
      throw AsksynkError.badRequest("Invalid avatar attachment");
    }
  }

  private async resolve(profile: UserProfile): Promise<ResolvedUserProfile> {
    if (!profile.avatarAttachmentId) {
      return { profile, avatar: null };
    }

    const [resolved] = await this.attachmentsService.resolveMany([
      profile.avatarAttachmentId,
    ]);

    return {
      profile,
      avatar: resolved ? { id: resolved.id, url: resolved.url } : null,
    };
  }
}
