import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("attention-items", {
  item_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Attention item with id { id } not found",
  },
  forbidden: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "User { userId } is not allowed to access attention item { id }",
  },
  item_already_exists: {
    category: DomainErrorCategory.CONFLICT,
    exposable: true,
    message:
      "Attention item with source { source } already exists for user { userId }",
  },
});

export const attentionItemsCatalog = catalog;
export const attentionItemError = createError;
