import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("attention-items", {
  item_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Attention item with id { id } not found",
  },
  guest_not_allowed: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Guests can't access attention items",
  },
});

export const attentionItemsCatalog = catalog;
export const attentionItemError = createError;
