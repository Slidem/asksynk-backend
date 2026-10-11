import { Module } from "@nestjs/common";

import { StorageModule } from "@/api/storage/storage.module";
import { UserProfileRepository } from "@/api/user-profile/domain/ports/user-profile.repository";
import { DrizzleUserProfileRepository } from "@/api/user-profile/repositories/drizzle-user-profile.repository";
import { UserProfileController } from "@/api/user-profile/rest/user-profile.controller";
import { UserProfileService } from "@/api/user-profile/services/user-profile.service";

@Module({
  imports: [StorageModule],
  providers: [
    { provide: UserProfileRepository, useClass: DrizzleUserProfileRepository },
    UserProfileService,
  ],
  controllers: [UserProfileController],
  exports: [UserProfileService],
})
export class UserProfileModule {}
