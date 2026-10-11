import { UserProfile } from "@/api/user-profile/domain/user-profile";

export abstract class UserProfileRepository {
  abstract getById(userId: string): Promise<UserProfile | null>;
  abstract update(profile: UserProfile): Promise<UserProfile>;
}
