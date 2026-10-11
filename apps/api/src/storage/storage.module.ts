import { Module } from "@nestjs/common";

import { AttachmentAccessService } from "@/api/storage/attachment-access.service";
import { DrizzleAttachmentsRepository } from "@/api/storage/attachments/repositories/drizzle-attachments.repository";
import { AttachmentsController } from "@/api/storage/attachments/rest/attachments.controller";
import { AttachmentsService } from "@/api/storage/attachments/services/attachments.service";
import { AttachmentAccessPort } from "@/api/storage/contract/attachment-access.port";
import { AttachmentCatalogPort } from "@/api/storage/contract/attachment-catalog.port";
import { AttachmentsRepository } from "@/api/storage/domain/ports/attachments.repository";
import { GarageObjectStorage } from "@/api/storage/garage-object-storage";
import { ObjectStorage } from "@/api/storage/object-storage";

@Module({
  providers: [
    { provide: ObjectStorage, useClass: GarageObjectStorage },
    AttachmentAccessService,
    { provide: AttachmentsRepository, useClass: DrizzleAttachmentsRepository },
    AttachmentsService,
    { provide: AttachmentAccessPort, useExisting: AttachmentAccessService },
    { provide: AttachmentCatalogPort, useExisting: AttachmentsService },
  ],
  controllers: [AttachmentsController],
  exports: [AttachmentAccessPort, AttachmentCatalogPort],
})
export class StorageModule {}
