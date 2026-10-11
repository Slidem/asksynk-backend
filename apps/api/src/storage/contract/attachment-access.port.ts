import { AttachmentPlacement } from "@/api/storage/contract/attachment-catalog.port";

/** Who is acting; resolvers authorize against this. */
export interface AttachmentActor {
  userId: string;
}

/**
 * A per-placement read-permission strategy. Each feature (messaging, …) implements one
 * and registers it on `AttachmentAccessPort` at bootstrap. Storage never imports the
 * feature — dependency points feature → storage.
 */
export interface AttachmentPermissionResolver {
  readonly placement: AttachmentPlacement;
  canRead(attachmentId: string, actor: AttachmentActor): Promise<boolean>;
}

export abstract class AttachmentAccessPort {
  abstract register(resolver: AttachmentPermissionResolver): void;
}
