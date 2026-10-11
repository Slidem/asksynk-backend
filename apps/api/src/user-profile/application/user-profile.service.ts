import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { AttachmentCatalogPort } from "@/api/files/contract/attachment-catalog.port";
import { UpdateUserProfileInput } from "@/api/user-profile/application/update-user-profile.model";
import { UserProfileRepository } from "@/api/user-profile/domain/ports/user-profile.repository";
import { UserProfile } from "@/api/user-profile/domain/user-profile";
import { userProfileError } from "@/api/user-profile/user-profile.errors";

@Injectable()
export class UserProfileService {
  constructor(
    private readonly userProfileRepository: UserProfileRepository,
    private readonly attachmentCatalog: AttachmentCatalogPort,
  ) {}

  @Transactional()
  async getProfile(userId: string): Promise<UserProfile> {
    const profile = await this.userProfileRepository.getById(userId);
    if (!profile) {
      throw userProfileError("user_profile_not_found", { userId });
    }
    return profile;
  }

  @Transactional()
  async updateProfile(input: UpdateUserProfileInput): Promise<UserProfile> {
    const profile = await this.userProfileRepository.getById(input.userId);
    if (!profile) {
      throw userProfileError("user_profile_not_found", {
        userId: input.userId,
      });
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
        profile.image = await this.resolveAvatarUrl(
          input.userId,
          input.avatarAttachmentId,
        );
      }
    }

    return this.userProfileRepository.update(profile);
  }

  /** Avatar must be a public, finalized attachment owned by the same user. */
  private async resolveAvatarUrl(
    userId: string,
    attachmentId: string,
  ): Promise<string> {
    await this.attachmentCatalog.assertUsable([attachmentId], {
      ownerUserId: userId,
      placement: "public",
    });
    // Public placement → stable public url.
    const [avatar] = await this.attachmentCatalog.resolveMany([attachmentId]);
    if (!avatar) {
      // Deactivated between the check and the resolve.
      throw userProfileError("invalid_avatar_attachment", { attachmentId });
    }
    return avatar.url;
  }
}
