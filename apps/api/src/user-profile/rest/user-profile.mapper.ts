import { UserProfile } from "@/api/user-profile/entities/user-profile.entity";
import { UserProfileResponseDto } from "@/api/user-profile/rest/responses/user-profile.response";

export function toUserProfileResponseDto(
  profile: UserProfile,
): UserProfileResponseDto {
  return {
    id: profile.id,
    name: profile.name,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    image: profile.image,
    phone: profile.phone,
  };
}
