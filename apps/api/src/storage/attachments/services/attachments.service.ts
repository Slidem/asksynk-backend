import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";
import { uuidv7 } from "uuidv7";

import { AttachmentAccessService } from "@/api/storage/attachment-access.service";
import { Attachment } from "@/api/storage/attachments/entities/attachment.entity";
import {
  ALLOWED_CONTENT_TYPES,
  AttachmentActor,
  AttachmentPlacement,
  bucketForPlacement,
  DOWNLOAD_URL_TTL_SECONDS,
  MAX_ATTACHMENT_BYTES,
  ReadableAttachment,
  UPLOAD_URL_TTL_SECONDS,
} from "@/api/storage/attachments/models/attachment.model";
import { AttachmentsRepository } from "@/api/storage/attachments/repositories/attachments.repository";
import { ObjectStorage, UploadGrant } from "@/api/storage/object-storage";

export interface CreateAttachmentInput {
  placement: AttachmentPlacement;
  contentType: string;
  fileName?: string;
  sizeBytes: number;
}

export interface CreatedUpload {
  attachmentId: string;
  storageKey: string;
  upload: UploadGrant;
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new ContextLogger(AttachmentsService.name);

  constructor(
    private readonly repo: AttachmentsRepository,
    private readonly storage: ObjectStorage,
    private readonly access: AttachmentAccessService,
  ) {}

  // Not @Transactional: a single insert needs no tx, and the presign step must not
  // sit inside an open transaction.
  async createUpload(
    actor: AttachmentActor,
    input: CreateAttachmentInput,
  ): Promise<CreatedUpload> {
    this.assertContentType(input.contentType);
    this.assertSize(input.sizeBytes);

    const id = uuidv7();
    const storageKey = this.buildKey(actor.userId, input.placement, id);
    const bucket = bucketForPlacement(input.placement);

    await this.repo.add(
      Attachment.create({
        id,
        ownerUserId: actor.userId,
        placement: input.placement,
        storageKey,
        contentType: input.contentType,
        sizeBytes: null,
        fileName: input.fileName ?? null,
        status: "pending",
        createdAt: new Date(),
      }),
    );

    const upload = await this.storage.createUploadGrant(
      bucket,
      storageKey,
      { maxBytes: MAX_ATTACHMENT_BYTES, contentType: input.contentType },
      UPLOAD_URL_TTL_SECONDS,
    );

    return { attachmentId: id, storageKey, upload };
  }

  /**
   * Confirm an upload completed: HEAD the object and validate real size + type before
   * flipping to `active`. Defense-in-depth even though the POST policy enforces limits.
   */
  async finalize(
    actor: AttachmentActor,
    id: string,
  ): Promise<ReadableAttachment> {
    const attachment = await this.repo.getById(id);
    if (!attachment) {
      throw new NotFoundException("Attachment not found");
    }
    if (!attachment.isOwnedBy(actor.userId)) {
      throw new ForbiddenException();
    }
    if (attachment.isActive()) {
      return this.toReadable(attachment);
    }

    const bucket = bucketForPlacement(attachment.placement);
    const head = await this.storage.head(bucket, attachment.storageKey);
    if (!head) {
      throw new BadRequestException("Upload not found in storage");
    }
    if (head.contentLength <= 0 || head.contentLength > MAX_ATTACHMENT_BYTES) {
      await this.discard(attachment.id, bucket, attachment.storageKey);
      throw new BadRequestException("Uploaded object exceeds size limit");
    }
    // Strip any `; charset=…` parameter the store may echo before comparing.
    const baseType = head.contentType.split(";")[0].trim();
    if (!ALLOWED_CONTENT_TYPES.includes(baseType)) {
      await this.discard(attachment.id, bucket, attachment.storageKey);
      throw new BadRequestException("Uploaded object has disallowed type");
    }

    const active = await this.repo.markActive(
      attachment.id,
      head.contentLength,
    );
    if (!active) {
      throw new NotFoundException("Attachment not found");
    }
    return this.toReadable(active);
  }

  /**
   * Trusted batch resolve: fetch many attachments and build fresh readable views in a
   * single round-trip, WITHOUT per-item authorization. Precondition: the caller has
   * already authorized the reader for all `ids` (e.g. they are linked to messages in a
   * thread the reader participates in / the room the event is emitted to). For the
   * self-authorizing single read use `getReadable`. Non-existent / non-active ids are
   * simply omitted.
   */
  async resolveMany(ids: string[]): Promise<ReadableAttachment[]> {
    const attachments = await this.repo.getByIds(ids);
    return Promise.all(
      attachments.filter((a) => a.isActive()).map((a) => this.toReadable(a)),
    );
  }

  /** Stable public url for a `placement="public"` attachment (e.g. an avatar). */
  publicUrlForAttachment(attachment: Attachment): string {
    return this.storage.publicUrl(attachment.storageKey);
  }

  /** Generic read: authorize via the placement resolver, then build a fresh url. */
  async getReadable(
    actor: AttachmentActor,
    id: string,
  ): Promise<ReadableAttachment> {
    const attachment = await this.repo.getById(id);
    if (!attachment) {
      throw new NotFoundException("Attachment not found");
    }
    await this.validateReadable(attachment, actor);
    return this.toReadable(attachment);
  }

  private async validateReadable(
    attachment: Attachment,
    actor: AttachmentActor,
  ): Promise<void> {
    if (!attachment.isActive()) {
      throw new NotFoundException(`Attachment ${attachment.id} not found`);
    }
    if (!(await this.access.canRead(attachment, actor))) {
      throw new ForbiddenException(`No access to attachment ${attachment.id}`);
    }
  }

  private async toReadable(
    attachment: Attachment,
  ): Promise<ReadableAttachment> {
    const base = {
      id: attachment.id,
      contentType: attachment.contentType,
      fileName: attachment.fileName,
      sizeBytes: attachment.sizeBytes,
    };
    if (attachment.placement === "public") {
      return {
        ...base,
        url: this.storage.publicUrl(attachment.storageKey),
        expiresAt: null,
      };
    }
    const signed = await this.storage.createDownloadUrl(
      bucketForPlacement(attachment.placement),
      attachment.storageKey,
      DOWNLOAD_URL_TTL_SECONDS,
    );
    return { ...base, url: signed.url, expiresAt: signed.expiresAt };
  }

  private async discard(
    id: string,
    bucket: ReturnType<typeof bucketForPlacement>,
    key: string,
  ): Promise<void> {
    // Delete the object first; only drop the row once it's gone. On failure the row
    // stays `pending` so the orphan-cleanup sweeper can reclaim it later.
    try {
      await this.storage.delete(bucket, key);
      await this.repo.delete(id);
    } catch (err) {
      this.logger.warn("Failed to discard rejected object", { id, key, err });
    }
  }

  private buildKey(
    userId: string,
    placement: AttachmentPlacement,
    id: string,
  ): string {
    // Public attachments are in a separate bucket and have a flat key namespace, so just use the ID as the key.
    return placement === "public" ? `${id}` : `users/${userId}/${id}`;
  }

  private assertContentType(contentType: string): void {
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new BadRequestException(`Unsupported content type: ${contentType}`);
    }
  }

  private assertSize(sizeBytes: number): void {
    if (sizeBytes <= 0 || sizeBytes > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException("File exceeds maximum allowed size");
    }
  }
}
