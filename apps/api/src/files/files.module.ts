import { Module } from "@nestjs/common";

import { AttachmentAccessService } from "@/api/files/application/attachment-access.service";
import { AttachmentsService } from "@/api/files/application/attachments.service";
import { AttachmentAccessPort } from "@/api/files/contract/attachment-access.port";
import { AttachmentCatalogPort } from "@/api/files/contract/attachment-catalog.port";
import { AttachmentsRepository } from "@/api/files/domain/ports/attachments.repository";
import { ObjectStorage } from "@/api/files/domain/ports/object-storage";
import { GarageObjectStorage } from "@/api/files/infrastructure/garage-object-storage";
import { DrizzleAttachmentsRepository } from "@/api/files/infrastructure/persistence/drizzle-attachments.repository";
import { AttachmentsController } from "@/api/files/presentation/rest/attachments.controller";

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
export class FilesModule {}
