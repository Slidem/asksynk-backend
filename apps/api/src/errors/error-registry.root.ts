import { attentionItemsCatalog } from "src/attention-items/attention-items.errors";
import { calendarEventsCatalog } from "src/calendar-events/calendar-events.errors";
import { buildErrorRegistry } from "src/kernel/errors/error-registry";

export const ERROR_REGISTRY = buildErrorRegistry([
  attentionItemsCatalog,
  calendarEventsCatalog,
]);
