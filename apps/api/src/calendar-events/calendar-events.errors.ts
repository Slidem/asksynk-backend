import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("calendar-events", {
  calendar_not_found_for_user: {
    category: DomainErrorCategory.NOT_FOUND,
    message: "Calendar event for user id { id } not found",
    exposable: true,
  },
  calendar_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    message: "Calendar with id { id } not found",
    exposable: true,
  },
  calendar_event_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    message: "Calendar event with id { id } not found",
    exposable: true,
  },
  imported_calendar_event_readonly: {
    category: DomainErrorCategory.FORBIDDEN,
    message: "Imported calendar event with id { id } is read-only",
    exposable: true,
  },
  calendar_event_is_not_recurring: {
    category: DomainErrorCategory.CONFLICT,
    message: "Calendar event with id { id } is not a recurring event",
    exposable: true,
  },
  one_or_more_tags_not_found: {
    category: DomainErrorCategory.CONFLICT,
    message: "One or more tags with ids { tagIds } not found",
    exposable: true,
  },
});

export const calendarEventsCatalog = catalog;
export const calendarEventError = createError;
