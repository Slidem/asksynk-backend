import { PublicView } from "@/api/public-views/entities/public-view.entity";
import { PublicViewGuest } from "@/api/public-views/entities/public-view-guest.entity";
import { PublicViewGuestResponseDto } from "@/api/public-views/rest/responses/guest.response";
import {
  PublicViewMetadataResponseDto,
  PublicViewResponseDto,
} from "@/api/public-views/rest/responses/public-view.response";

export function toPublicViewResponseDto(input: {
  view: PublicView;
  url: string;
  guestCount?: number;
}): PublicViewResponseDto {
  return {
    id: input.view.id,
    slug: input.view.slug,
    name: input.view.name,
    url: input.url,
    expiresAt: input.view.expiresAt.toISOString(),
    revokedAt: input.view.revokedAt?.toISOString() ?? null,
    createdAt: input.view.createdAt.toISOString(),
    guestCount: input.guestCount,
  };
}

export function toPublicViewMetadataResponseDto(
  view: PublicView,
): PublicViewMetadataResponseDto {
  return {
    slug: view.slug,
    ownerUserId: view.ownerUserId,
    name: view.name,
    expiresAt: view.expiresAt.toISOString(),
  };
}

export function toGuestResponseDto(input: {
  guest: PublicViewGuest;
  messageCount: number;
}): PublicViewGuestResponseDto {
  return {
    id: input.guest.id,
    displayName: input.guest.displayName,
    createdAt: input.guest.createdAt.toISOString(),
    lastSeenAt: input.guest.lastSeenAt.toISOString(),
    messageCount: input.messageCount,
  };
}
