import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { Clock } from "@/api/platform/clock/clock";
import { UserSettingsRepository } from "@/api/user-settings/domain/ports/user-settings.repository";
import { UserSettings } from "@/api/user-settings/domain/user-settings";
import { UpdateUserSettingsInput } from "@/api/user-settings/domain/user-settings.model";

@Injectable()
export class UserSettingsService {
  constructor(
    private readonly settingsRepo: UserSettingsRepository,
    private readonly clock: Clock,
  ) {}

  @Transactional()
  async getSettings(userId: string): Promise<UserSettings> {
    return this.settingsRepo.ensure(userId);
  }

  @Transactional()
  async updateSettings(
    userId: string,
    input: UpdateUserSettingsInput,
  ): Promise<UserSettings> {
    return this.settingsRepo.update(userId, input, this.clock.now());
  }
}
