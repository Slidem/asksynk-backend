import { Attachment } from "@/api/storage/attachments/entities/attachment.entity";
import {
  AttachmentActor,
  AttachmentPlacement,
} from "@/api/storage/attachments/models/attachment.model";

/**
 * A per-placement permission strategy. Each feature (messaging, calendar, …) implements
 * one and registers it on the AttachmentAccessService at bootstrap. Storage core never
 * imports the feature — dependency points feature → storage.
 *
 * Only `canRead` is dispatched generically (for GET /attachments/:id). Linking a blob to
 * a domain resource is feature-specific (typed target) and is invoked directly by the
 * owning feature on its own resolver, so it is not part of this interface.
 */
export interface AttachmentPermissionResolver {
  readonly placement: AttachmentPlacement;
  canRead(attachment: Attachment, actor: AttachmentActor): Promise<boolean>;
}
