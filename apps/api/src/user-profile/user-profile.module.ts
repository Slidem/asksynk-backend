import { Module } from "@nestjs/common";

import { UserProfileRepository } from "@/api/user-profile/repositories/user-profile.repository";
import { UserProfileController } from "@/api/user-profile/rest/user-profile.controller";
import { UserProfileService } from "@/api/user-profile/services/user-profile.service";

// AttachmentsService + AttachmentsRepository come from the @Global StorageModule.
@Module({
  providers: [UserProfileRepository, UserProfileService],
  controllers: [UserProfileController],
  exports: [UserProfileService],
})
export class UserProfileModule {}
