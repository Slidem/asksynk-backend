import { ReadableAttachment } from "@/api/storage/attachments/models/attachment.model";
import { AttachmentsService } from "@/api/storage/attachments/services/attachments.service";

/**
 * Resolve all attachments for a batch of messages in one round-trip, grouped by message
 * id (each message's own `attachmentIds` order preserved). Trusted: the caller must have
 * already authorized the reader for these messages' thread, so no per-attachment access
 * check is run here (it would be both redundant and an N+1).
 */
export async function resolveAttachmentsByMessage(
  attachmentsService: AttachmentsService,
  messages: { id: string; attachmentIds: string[] }[],
): Promise<Map<string, ReadableAttachment[]>> {
  const readables = await attachmentsService.resolveMany(
    messages.flatMap((m) => m.attachmentIds),
  );
  const byId = new Map(readables.map((a) => [a.id, a] as const));

  const byMessage = new Map<string, ReadableAttachment[]>();
  for (const message of messages) {
    byMessage.set(
      message.id,
      message.attachmentIds
        .map((id) => byId.get(id))
        .filter((a): a is ReadableAttachment => !!a),
    );
  }
  return byMessage;
}
