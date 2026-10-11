import { PublicViewMetadata } from "@/api/sharing/domain/ports/public-views.repository";
import { PublicView } from "@/api/sharing/domain/public-view";
import { PublicViewGuest } from "@/api/sharing/domain/public-view-guest";
import { PublicViewGuestResponseDto } from "@/api/sharing/presentation/rest/responses/guest.response";
import {
  PublicViewMetadataResponseDto,
  PublicViewResponseDto,
} from "@/api/sharing/presentation/rest/responses/public-view.response";

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
  metadata: PublicViewMetadata,
): PublicViewMetadataResponseDto {
  const { view, ownerImage } = metadata;
  return {
    slug: view.slug,
    ownerUserId: view.ownerUserId,
    ownerImage,
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
