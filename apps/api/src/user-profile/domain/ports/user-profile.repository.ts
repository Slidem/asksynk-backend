import { UserProfile } from "@/api/user-profile/entities/user-profile.entity";

export abstract class UserProfileRepository {
  abstract getById(userId: string): Promise<UserProfile | null>;
  abstract update(profile: UserProfile): Promise<UserProfile>;
}
