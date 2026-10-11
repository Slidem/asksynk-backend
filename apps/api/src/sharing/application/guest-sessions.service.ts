import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { generateId } from "@/api/kernel/id";
import { GUEST_SESSION_TTL_MS } from "@/api/sharing/application/public-views.constants";
import {
  generateGuestToken,
  hashGuestToken,
} from "@/api/sharing/application/slug.util";
import { PublicViewGuestsRepository } from "@/api/sharing/domain/ports/public-view-guests.repository";
import {
  PublicViewMetadata,
  PublicViewsRepository,
} from "@/api/sharing/domain/ports/public-views.repository";
import { PublicView } from "@/api/sharing/domain/public-view";
import { PublicViewGuest } from "@/api/sharing/domain/public-view-guest";
import { publicViewsError } from "@/api/sharing/sharing.errors";

@Injectable()
export class GuestSessionsService {
  constructor(
    private readonly publicViewsRepository: PublicViewsRepository,
    private readonly guestsRepository: PublicViewGuestsRepository,
  ) {}

  async getViewMetadataBySlug(slug: string): Promise<PublicViewMetadata> {
    const metadata = await this.publicViewsRepository.getMetadataBySlug(slug);
    if (!metadata || !metadata.view.isLive()) {
      throw publicViewsError("public_view_not_found_or_expired", { slug });
    }
    return metadata;
  }

  @Transactional()
  async signIn(input: {
    slug: string;
    displayName: string;
  }): Promise<{ guest: PublicViewGuest; view: PublicView; token: string }> {
    const view = await this.publicViewsRepository.getBySlug(input.slug);

    if (!view || !view.isLive()) {
      throw publicViewsError("public_view_not_found_or_expired", {
        slug: input.slug,
      });
    }

    const now = new Date();

    const guestExpiresAt = new Date(
      Math.min(view.expiresAt.getTime(), now.getTime() + GUEST_SESSION_TTL_MS),
    );

    const token = generateGuestToken();

    const guest = await this.guestsRepository.insert({
      id: generateId(),
      publicViewId: view.id,
      displayName: input.displayName.trim(),
      tokenHash: hashGuestToken(token),
      expiresAt: guestExpiresAt,
    });

    return { guest, view, token };
  }
}
