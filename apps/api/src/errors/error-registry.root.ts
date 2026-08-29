import { attentionItemsCatalog } from "src/attention-items/attention-items.errors";
import { calendarEventsCatalog } from "src/calendar-events/calendar-events.errors";
import { buildErrorRegistry } from "src/kernel/errors/error-registry";
import { coreErrorsCatalog } from "src/kernel/errors/kernel.errors";

export const ERROR_REGISTRY = buildErrorRegistry([
  coreErrorsCatalog,
  attentionItemsCatalog,
  calendarEventsCatalog,
]);
