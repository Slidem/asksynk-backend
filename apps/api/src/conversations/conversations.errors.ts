import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("messaging", {
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
  guest_cannot_list_threads: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Guests cannot list threads",
  },
  // Messages below are realtime ack strings clients match on — keep verbatim.
  thread_id_required: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "threadId required",
  },
  guest_cannot_attach_files: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Guests cannot attach files",
  },
  guest_cannot_suggest_tasks: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Guests cannot suggest tasks",
  },
  guest_cannot_update_status: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "forbidden",
  },
});

export const messagingCatalog = catalog;
export const messagingError = createError;
