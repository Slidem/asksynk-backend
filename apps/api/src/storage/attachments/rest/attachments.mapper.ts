import { ReadableAttachment } from "@/api/storage/attachments/models/attachment.model";
import {
  AttachmentResponseDto,
  AttachmentUploadResponseDto,
} from "@/api/storage/attachments/rest/responses/attachment.response";
import { CreatedUpload } from "@/api/storage/attachments/services/attachments.service";

export function toAttachmentResponse(
  attachment: ReadableAttachment,
): AttachmentResponseDto {
  return {
    id: attachment.id,
    contentType: attachment.contentType,
    fileName: attachment.fileName,
    sizeBytes: attachment.sizeBytes,
    url: attachment.url,
    expiresAt: attachment.expiresAt ? attachment.expiresAt.toISOString() : null,
  };
}

export function toUploadResponse(
  created: CreatedUpload,
): AttachmentUploadResponseDto {
  return {
    attachmentId: created.attachmentId,
    storageKey: created.storageKey,
    upload: {
      url: created.upload.url,
      fields: created.upload.fields,
      expiresAt: created.upload.expiresAt.toISOString(),
    },
  };
}
