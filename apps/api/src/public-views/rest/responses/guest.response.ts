export class GuestSignInResponseDto {
  guestId!: string;
  token!: string;
  expiresAt!: string;
  publicViewId!: string;
}

export class GuestSessionResponseDto {
  guestId!: string;
  displayName!: string;
  publicViewId!: string;
  expiresAt!: string;
}

export class PublicViewGuestResponseDto {
  id!: string;
  displayName!: string;
  createdAt!: string;
  lastSeenAt!: string;
  messageCount!: number;
}
