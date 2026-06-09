import { ResolvedUserProfile } from "@/api/user-profile/models/user-profile.model";
import { UserProfileResponseDto } from "@/api/user-profile/rest/responses/user-profile.response";

export function toUserProfileResponseDto(
  resolved: ResolvedUserProfile,
): UserProfileResponseDto {
  const { profile, avatar } = resolved;
  return {
    id: profile.id,
    name: profile.name,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    image: profile.image,
    phone: profile.phone,
    avatar: avatar ? { id: avatar.id, url: avatar.url } : null,
  };
}
