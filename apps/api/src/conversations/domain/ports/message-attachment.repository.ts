export abstract class MessageAttachmentRepository {
  abstract userCanReachAttachment(
    attachmentId: string,
    userId: string,
  ): Promise<boolean>;
}
