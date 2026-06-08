import { Global, Module } from "@nestjs/common";

import { AttachmentAccessService } from "@/api/storage/attachment-access.service";
import { AttachmentsRepository } from "@/api/storage/attachments/repositories/attachments.repository";
import { AttachmentsController } from "@/api/storage/attachments/rest/attachments.controller";
import { AttachmentsService } from "@/api/storage/attachments/services/attachments.service";
import { GarageObjectStorage } from "@/api/storage/garage-object-storage";
import { ObjectStorage } from "@/api/storage/object-storage";

@Global()
@Module({
  providers: [
    { provide: ObjectStorage, useClass: GarageObjectStorage },
    AttachmentAccessService,
    AttachmentsRepository,
    AttachmentsService,
  ],
  controllers: [AttachmentsController],
  exports: [
    ObjectStorage,
    AttachmentAccessService,
    AttachmentsService,
    AttachmentsRepository,
  ],
})
export class StorageModule {}
