import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { Clock } from "@/api/common/clock/clock";
import { UserSettings } from "@/api/user-settings/entities/user-settings.entity";
import { UpdateUserSettingsInput } from "@/api/user-settings/models/user-settings.model";
import { UserSettingsRepository } from "@/api/user-settings/user-settings.repository";

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
