import { Module } from "@nestjs/common";

import { FilesModule } from "@/api/files/files.module";
import { UserProfileService } from "@/api/user-profile/application/user-profile.service";
import { UserProfileRepository } from "@/api/user-profile/domain/ports/user-profile.repository";
import { DrizzleUserProfileRepository } from "@/api/user-profile/infrastructure/persistence/drizzle-user-profile.repository";
import { UserProfileController } from "@/api/user-profile/presentation/rest/user-profile.controller";

@Module({
  imports: [FilesModule],
  providers: [
    { provide: UserProfileRepository, useClass: DrizzleUserProfileRepository },
    UserProfileService,
  ],
  controllers: [UserProfileController],
  exports: [UserProfileService],
})
export class UserProfileModule {}
