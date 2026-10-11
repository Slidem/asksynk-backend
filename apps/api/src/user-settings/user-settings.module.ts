import { Module } from "@nestjs/common";

import { UserSettingsService } from "@/api/user-settings/application/user-settings.service";
import { UserSettingsRepository } from "@/api/user-settings/domain/ports/user-settings.repository";
import { DrizzleUserSettingsRepository } from "@/api/user-settings/infrastructure/persistence/drizzle-user-settings.repository";
import { UserSettingsController } from "@/api/user-settings/presentation/rest/user-settings.controller";

@Module({
  providers: [
    { provide: UserSettingsRepository, useClass: DrizzleUserSettingsRepository },
    UserSettingsService,
  ],
  controllers: [UserSettingsController],
})
export class UserSettingsModule {}
