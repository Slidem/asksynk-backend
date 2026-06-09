import { Module } from "@nestjs/common";

import { UserSettingsController } from "@/api/user-settings/rest/user-settings.controller";
import { UserSettingsRepository } from "@/api/user-settings/user-settings.repository";
import { UserSettingsService } from "@/api/user-settings/user-settings.service";

@Module({
  providers: [UserSettingsRepository, UserSettingsService],
  controllers: [UserSettingsController],
})
export class UserSettingsModule {}
