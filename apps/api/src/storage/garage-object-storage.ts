import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Clock } from "@/api/common/clock/clock";
import {
  ObjectHead,
  ObjectStorage,
  SignedDownload,
  StorageBucket,
  UploadConstraints,
  UploadGrant,
} from "@/api/storage/object-storage";

@Injectable()
export class GarageObjectStorage extends ObjectStorage {
  private readonly client: S3Client;
  private readonly buckets: Record<StorageBucket, string>;
  private readonly publicBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly clock: Clock,
  ) {
    super();

    this.client = new S3Client({
      endpoint: config.getOrThrow("S3_ENDPOINT"),
      region: config.get("S3_REGION") ?? "garage",
      credentials: {
        accessKeyId: config.getOrThrow("S3_ACCESS_KEY_ID"),
        secretAccessKey: config.getOrThrow("S3_SECRET_ACCESS_KEY"),
      },
      forcePathStyle: config.get("S3_FORCE_PATH_STYLE") !== "false",
    });

    this.buckets = {
      private: config.getOrThrow("S3_BUCKET_PRIVATE"),
      public: config.getOrThrow("S3_BUCKET_PUBLIC"),
    };

    this.publicBaseUrl = config
      .getOrThrow<string>("S3_PUBLIC_BASE_URL")
      .replace(/\/$/, "");
  }

  async createUploadGrant(
    bucket: StorageBucket,
    key: string,
    constraints: UploadConstraints,
    ttlSeconds: number,
  ): Promise<UploadGrant> {
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.buckets[bucket],
      Key: key,
      // Storage-layer enforcement: reject oversized / wrong-type before the object lands.
      Conditions: [
        ["content-length-range", 1, constraints.maxBytes],
        ["eq", "$Content-Type", constraints.contentType],
      ],
      Fields: { "Content-Type": constraints.contentType },
      Expires: ttlSeconds,
    });

    return { url, fields, expiresAt: this.expiresAt(ttlSeconds) };
  }

  async createDownloadUrl(
    bucket: StorageBucket,
    key: string,
    ttlSeconds: number,
  ): Promise<SignedDownload> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
      { expiresIn: ttlSeconds },
    );

    return { url, expiresAt: this.expiresAt(ttlSeconds) };
  }

  async head(bucket: StorageBucket, key: string): Promise<ObjectHead | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
      );
      return {
        contentType: res.ContentType ?? "application/octet-stream",
        contentLength: res.ContentLength ?? 0,
      };
    } catch (err) {
      if (this.isNotFound(err)) {
        return null;
      }
      throw err;
    }
  }

  async delete(bucket: StorageBucket, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
    );
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  private expiresAt(ttlSeconds: number): Date {
    return new Date(this.clock.now().getTime() + ttlSeconds * 1000);
  }

  private isNotFound(err: unknown): boolean {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    return e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
  }
}
