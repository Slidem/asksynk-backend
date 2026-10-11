import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("calendar-integrations", {
  unsupported_provider: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Calendar integration with provider { provider } is not supported",
  },
  invalid_oauth_state: {
    category: DomainErrorCategory.INVALID_VALUE,
    message: "Invalid OAuth state",
    exposable: true,
  },
  calendar_does_not_belong_to_this_integration: {
    category: DomainErrorCategory.FORBIDDEN,
    message: "Calendar { calendarId } does not belong to this integration",
    exposable: true,
  },
  calendar_integration_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    message: "Calendar integration with id { integrationId } not found",
    exposable: true,
  },
});

export const calendarIntegrationsCatalog = catalog;
export const calendarIntegrationError = createError;
