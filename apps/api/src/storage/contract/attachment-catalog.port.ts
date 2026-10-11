export const ATTACHMENT_PLACEMENTS = ["public", "message"] as const;
export type AttachmentPlacement = (typeof ATTACHMENT_PLACEMENTS)[number];

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

export abstract class AttachmentCatalogPort {
  /**
   * Gate before another context links/uses uploaded blobs: each must exist, be owned by
   * `ownerUserId`, be finalized and declared for `placement`. Throws
   * `storage.attachment_not_usable` otherwise.
   */
  abstract assertUsable(
    ids: string[],
    rule: { ownerUserId: string; placement: AttachmentPlacement },
  ): Promise<void>;

  /**
   * Trusted batch resolve, WITHOUT per-item authorization: the caller has already
   * authorized the reader for all `ids`. Missing / non-active ids are omitted.
   */
  abstract resolveMany(ids: string[]): Promise<ReadableAttachment[]>;
}
