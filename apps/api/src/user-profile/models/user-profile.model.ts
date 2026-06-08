import { UserProfile } from "@/api/user-profile/entities/user-profile.entity";

export interface ResolvedAvatar {
  id: string;
  url: string;
}

/** Profile plus its avatar resolved to a public, client-consumable url. */
export interface ResolvedUserProfile {
  profile: UserProfile;
  avatar: ResolvedAvatar | null;
}
