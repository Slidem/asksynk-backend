import { CreatedUpload } from "@/api/files/application/attachments.service";
import { ReadableAttachment } from "@/api/files/contract/attachment-catalog.port";
import {
  AttachmentResponseDto,
  AttachmentUploadResponseDto,
} from "@/api/files/presentation/rest/responses/attachment.response";

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
