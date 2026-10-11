import { PublicView } from "@/api/sharing/domain/public-view";

export type PublicViewWithStats = {
  view: PublicView;
  guestCount: number;
};

export type PublicViewMetadata = {
  view: PublicView;
  ownerImage: string | null;
};

export abstract class PublicViewsRepository {
  abstract insert(input: {
    id: string;
    ownerUserId: string;
    slug: string;
    name: string | null;
    expiresAt: Date;
  }): Promise<PublicView | null>;
  abstract getById(id: string): Promise<PublicView | null>;
  abstract getByIds(ids: string[]): Promise<PublicView[]>;
  abstract getBySlug(slug: string): Promise<PublicView | null>;
  abstract getMetadataBySlug(slug: string): Promise<PublicViewMetadata | null>;
  abstract listForOwnerWithStats(
    ownerUserId: string,
  ): Promise<PublicViewWithStats[]>;
  abstract revoke(id: string, ownerUserId: string): Promise<PublicView | null>;
}
