import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("messaging", {
  invalid_attachment: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "Attachment with id { attachmentId } is invalid",
  },
  message_not_found_for_thread: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Message with id { messageId } not found for thread { threadId }",
  },
  message_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Message with id { messageId } not found",
  },
  thread_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Thread with id { threadId } not found",
  },
  cannot_start_thread: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Cannot start a thread; reason: { reason }",
  },
  cannot_tag_message: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Cannot tag this message; reason: { reason }",
  },
  cannot_update_message: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Cannot update this message; reason: { reason }",
  },
  cannot_reply_to_message: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Cannot reply to this message; reason: { reason }",
  },
  thread_is_frozen: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Thread with id { threadId } is frozen and cannot be updated",
  },
});

export const messagingCatalog = catalog;
export const messagingError = createError;
