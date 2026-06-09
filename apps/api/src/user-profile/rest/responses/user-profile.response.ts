export interface UserProfileResponseDto {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  image: string | null;
  phone: string | null;
  avatar: { id: string; url: string } | null;
}
