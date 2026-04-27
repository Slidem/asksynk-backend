export interface GuestSignInResponseDto {
  guestId: string;
  token: string;
  expiresAt: string;
  publicViewId: string;
}

export interface GuestSessionResponseDto {
  guestId: string;
  displayName: string;
  publicViewId: string;
  expiresAt: string;
}

export interface PublicViewGuestResponseDto {
  id: string;
  displayName: string;
  createdAt: string;
  lastSeenAt: string;
  messageCount: number;
}
