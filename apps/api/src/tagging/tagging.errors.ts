import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("tags", {
  tag_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Tag with id { tagId } not found",
  },
  tags_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "One or more tags not found",
  },
});

export const tagsCatalog = catalog;
export const tagsError = createError;
