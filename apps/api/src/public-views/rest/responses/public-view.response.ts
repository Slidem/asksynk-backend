export class PublicViewResponseDto {
  id!: string;
  slug!: string;
  name!: string | null;
  url!: string;
  expiresAt!: string;
  revokedAt!: string | null;
  createdAt!: string;
  guestCount?: number;
}

export class PublicViewMetadataResponseDto {
  slug!: string;
  ownerUserId!: string;
  ownerImage!: string | null;
  name!: string | null;
  expiresAt!: string;
}
