import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("dead_letters", {
  dead_letter_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Dead letter { id } not found",
  },
  dead_letter_not_pending: {
    category: DomainErrorCategory.CONFLICT,
    exposable: true,
    message: "Dead letter { id } is { status }, not pending",
  },
  dead_letter_replay_failed: {
    category: DomainErrorCategory.RULE_VIOLATION,
    exposable: true,
    message: "Dead letter { id } can't be replayed: { reason }",
  },
  invalid_bulk_transition: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "{ reason }",
  },
});

export const deadLettersCatalog = catalog;
export const deadLettersError = createError;
