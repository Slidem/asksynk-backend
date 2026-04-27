export interface NetworkConnectionResponseDto {
  userId: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  image: string | null;
  connectedAt: string;
}
