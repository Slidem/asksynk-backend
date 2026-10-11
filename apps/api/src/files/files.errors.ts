import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("storage", {
  attachment_not_usable: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "Attachment with id { attachmentId } is invalid",
  },
});

export const storageCatalog = catalog;
export const storageError = createError;
