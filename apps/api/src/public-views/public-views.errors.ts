import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("public-views", {
  public_view_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Public view with id { viewId } not found",
  },
  public_view_not_found_or_expired: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Public view { slug } not found or expired",
  },
  invalid_expiry: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "Public view expiry is invalid; reason: { reason }",
  },
  slug_allocation_failed: {
    category: DomainErrorCategory.INTERNAL,
    exposable: false,
    message: "Failed to allocate public view slug after { attempts } attempts",
  },
});

export const publicViewsCatalog = catalog;
export const publicViewsError = createError;
