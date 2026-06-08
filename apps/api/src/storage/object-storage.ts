export type StorageBucket = "private" | "public";

export interface UploadConstraints {
  maxBytes: number;
  contentType: string;
}

export interface UploadGrant {
  url: string;
  fields: Record<string, string>;
  expiresAt: Date;
}

export interface SignedDownload {
  url: string;
  expiresAt: Date;
}

export interface ObjectHead {
  contentType: string;
  contentLength: number;
}

/**
 * Provider-agnostic object store. Bound to a concrete impl (Garage) in StorageModule
 * via `useClass`; swap providers by changing that one binding. The abstract class is
 * both the interface and the DI token (mirrors the `Clock` pattern).
 */
export abstract class ObjectStorage {
  /** Presigned POST grant (url + form fields) for a direct browser upload. */
  abstract createUploadGrant(
    bucket: StorageBucket,
    key: string,
    constraints: UploadConstraints,
    ttlSeconds: number,
  ): Promise<UploadGrant>;

  /** Short-lived presigned GET url for a private object. */
  abstract createDownloadUrl(
    bucket: StorageBucket,
    key: string,
    ttlSeconds: number,
  ): Promise<SignedDownload>;

  /** Object metadata, or null if it does not exist. */
  abstract head(bucket: StorageBucket, key: string): Promise<ObjectHead | null>;

  abstract delete(bucket: StorageBucket, key: string): Promise<void>;

  /** Stable, non-signed, cacheable url for an object in the public bucket. */
  abstract publicUrl(key: string): string;
}
