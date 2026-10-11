import { UserSettings } from "@/api/user-settings/entities/user-settings.entity";
import { UpdateUserSettingsInput } from "@/api/user-settings/models/user-settings.model";

export abstract class UserSettingsRepository {
  abstract ensure(userId: string): Promise<UserSettings>;
  abstract update(
    userId: string,
    input: UpdateUserSettingsInput,
    now: Date,
  ): Promise<UserSettings>;
}
