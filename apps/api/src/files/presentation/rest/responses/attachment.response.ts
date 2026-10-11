export class AttachmentResponseDto {
  id!: string;
  contentType!: string;
  fileName!: string | null;
  sizeBytes!: number | null;
  url!: string;
  /** ISO string for signed urls; null for stable public urls. */
  expiresAt!: string | null;
}

export class AttachmentUploadDto {
  url!: string;
  fields!: Record<string, string>;
  expiresAt!: string;
}

export class AttachmentUploadResponseDto {
  attachmentId!: string;
  storageKey!: string;
  upload!: AttachmentUploadDto;
}
