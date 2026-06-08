export interface AttachmentResponseDto {
  id: string;
  contentType: string;
  fileName: string | null;
  sizeBytes: number | null;
  url: string;
  /** ISO string for signed urls; null for stable public urls. */
  expiresAt: string | null;
}

export interface AttachmentUploadResponseDto {
  attachmentId: string;
  storageKey: string;
  upload: {
    url: string;
    fields: Record<string, string>;
    expiresAt: string;
  };
}
