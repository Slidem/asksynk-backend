import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("user-profile", {
  user_profile_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "User profile for user { userId } not found",
  },
  invalid_avatar_attachment: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "Avatar attachment { attachmentId } is invalid",
  },
});

export const userProfileCatalog = catalog;
export const userProfileError = createError;
