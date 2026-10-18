import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("timers", {
  invalid_transition: {
    category: DomainErrorCategory.CONFLICT,
    exposable: true,
    message:
      "Timer can't { action } while { status } (current mode: { currentMode })",
  },
  guest_not_allowed: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Guests can't use timers",
  },
  invalid_command_input: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "Invalid timer command; reason: { reason }",
  },
});

export const timersCatalog = catalog;
export const timersError = createError;
