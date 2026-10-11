export class MessageAttachmentResponseDto {
  id!: string;
  contentType!: string;
  fileName!: string | null;
  sizeBytes!: number | null;
  url!: string;
  /** ISO string for signed urls; null for stable public urls. */
  expiresAt!: string | null;
}
