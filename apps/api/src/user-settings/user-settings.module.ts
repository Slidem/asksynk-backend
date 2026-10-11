import { Module } from "@nestjs/common";

import { UserSettingsRepository } from "@/api/user-settings/domain/ports/user-settings.repository";
import { DrizzleUserSettingsRepository } from "@/api/user-settings/drizzle-user-settings.repository";
import { UserSettingsController } from "@/api/user-settings/rest/user-settings.controller";
import { UserSettingsService } from "@/api/user-settings/user-settings.service";

@Module({
  providers: [
    { provide: UserSettingsRepository, useClass: DrizzleUserSettingsRepository },
    UserSettingsService,
  ],
  controllers: [UserSettingsController],
})
export class UserSettingsModule {}
