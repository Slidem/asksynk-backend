import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { AsksynkError } from "@/api/common/errors/errors.model";
import { PublicView } from "@/api/public-views/entities/public-view.entity";
import { PublicViewGuest } from "@/api/public-views/entities/public-view-guest.entity";
import { GUEST_SESSION_TTL_MS } from "@/api/public-views/public-views.constants";
import { PublicViewGuestsRepository } from "@/api/public-views/repositories/public-view-guests.repository";
import { PublicViewsRepository } from "@/api/public-views/repositories/public-views.repository";
import { generateGuestToken } from "@/api/public-views/utils/slug.util";
import { generateId } from "@/shared/id";

@Injectable()
export class GuestSessionsService {
  constructor(
    private readonly publicViewsRepository: PublicViewsRepository,
    private readonly guestsRepository: PublicViewGuestsRepository,
  ) {}

  async getViewMetadataBySlug(slug: string): Promise<PublicView> {
    const view = await this.publicViewsRepository.getBySlug(slug);
    if (!view || !view.isLive()) {
      throw AsksynkError.notFound("Public view not found or expired");
    }
    return view;
  }

  @Transactional()
  async signIn(input: {
    slug: string;
    displayName: string;
  }): Promise<{ guest: PublicViewGuest; view: PublicView }> {
    const view = await this.publicViewsRepository.getBySlug(input.slug);

    if (!view || !view.isLive()) {
      throw AsksynkError.notFound("Public view not found or expired");
    }

    const now = new Date();

    const guestExpiresAt = new Date(
      Math.min(view.expiresAt.getTime(), now.getTime() + GUEST_SESSION_TTL_MS),
    );

    const guest = await this.guestsRepository.insert({
      id: generateId(),
      publicViewId: view.id,
      displayName: input.displayName.trim(),
      token: generateGuestToken(),
      expiresAt: guestExpiresAt,
    });

    return { guest, view };
  }
}
