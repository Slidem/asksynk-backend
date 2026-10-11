import { Injectable } from "@nestjs/common";

import {
  GuestSummary,
  PublicLinkPort,
  PublicLinkSummary,
} from "@/api/sharing/contract/public-link.port";
import { PublicViewGuestsRepository } from "@/api/sharing/domain/ports/public-view-guests.repository";
import { PublicViewsRepository } from "@/api/sharing/domain/ports/public-views.repository";

@Injectable()
export class PublicLinkService extends PublicLinkPort {
  constructor(
    private readonly publicViewsRepository: PublicViewsRepository,
    private readonly publicViewGuestsRepository: PublicViewGuestsRepository,
  ) {
    super();
  }

  async isLive(publicViewId: string): Promise<boolean> {
    const view = await this.publicViewsRepository.getById(publicViewId);
    return !!view && view.isLive();
  }

  async getLinkSummaries(
    publicViewIds: string[],
  ): Promise<Map<string, PublicLinkSummary>> {
    const views = await this.publicViewsRepository.getByIds(publicViewIds);
    return new Map(
      views.map((v) => [
        v.id,
        { publicViewId: v.id, name: v.name, live: v.isLive() },
      ]),
    );
  }

  async getGuestSummaries(
    guestIds: string[],
  ): Promise<Map<string, GuestSummary>> {
    const guests = await this.publicViewGuestsRepository.getByIds(guestIds);
    return new Map(
      guests.map((g) => [
        g.id,
        {
          guestId: g.id,
          publicViewId: g.publicViewId,
          displayName: g.displayName,
        },
      ]),
    );
  }
}
