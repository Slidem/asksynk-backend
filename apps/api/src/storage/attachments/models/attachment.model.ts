import { StorageBucket } from "@/api/storage/object-storage";

export type AttachmentPlacement = "public" | "message";
export type AttachmentStatus = "pending" | "active";

/** Who is acting; resolvers authorize against this. */
export interface AttachmentActor {
  userId: string;
}

/** A resolved, client-consumable view of an attachment (with a fresh url). */
export interface ReadableAttachment {
  id: string;
  contentType: string;
  fileName: string | null;
  sizeBytes: number | null;
  url: string;
  /** null for public (stable) urls; a date for short-lived signed urls. */
  expiresAt: Date | null;
}

/** Max upload size enforced both in the POST policy and re-checked on finalize. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

/** Whitelist used for the POST-policy content-type condition + finalize check. */
export const ALLOWED_CONTENT_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/** Time a presigned GET stays valid. Client refetches before this elapses. */
export const DOWNLOAD_URL_TTL_SECONDS = 300;
/** Upload should start immediately; keep the window tight. */
export const UPLOAD_URL_TTL_SECONDS = 120;

export function bucketForPlacement(
  placement: AttachmentPlacement,
): StorageBucket {
  return placement === "public" ? "public" : "private";
}
