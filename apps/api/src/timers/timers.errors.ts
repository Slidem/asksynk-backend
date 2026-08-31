import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("timers", {
  unsupported_status: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "Unsupported timer status: { status }",
  },
  timer_not_paused: {
    category: DomainErrorCategory.CONFLICT,
    exposable: true,
    message: "Timer is not paused",
  },
  timer_not_running: {
    category: DomainErrorCategory.CONFLICT,
    exposable: true,
    message: "Timer is not running",
  },
  no_active_timer: {
    category: DomainErrorCategory.CONFLICT,
    exposable: true,
    message: "No active timer",
  },
  invalid_session_input: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "Invalid timer session input; reason: { reason }",
  },
});

export const timersCatalog = catalog;
export const timersError = createError;
