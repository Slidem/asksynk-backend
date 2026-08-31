import { attentionItemsCatalog } from "@/api/attention-items/attention-items.errors";
import { calendarEventsCatalog } from "@/api/calendar-events/calendar-events.errors";
import { calendarIntegrationsCatalog } from "@/api/calendar-integrations/calendar-integration.errors";
import { buildErrorRegistry } from "@/api/kernel/errors/error-registry";
import { coreErrorsCatalog } from "@/api/kernel/errors/kernel.errors";
import { messagingCatalog } from "@/api/messaging/messaging.errors";
import { networksCatalog } from "@/api/networks/networks.errors";
import { publicViewsCatalog } from "@/api/public-views/public-views.errors";
import { tagsCatalog } from "@/api/tags/tags.errors";
import { tasksCatalog } from "@/api/tasks/tasks.errors";
import { timersCatalog } from "@/api/timers/timers.errors";
import { userProfileCatalog } from "@/api/user-profile/user-profile.errors";

export const ERROR_REGISTRY = buildErrorRegistry([
  coreErrorsCatalog,
  attentionItemsCatalog,
  calendarEventsCatalog,
  calendarIntegrationsCatalog,
  messagingCatalog,
  networksCatalog,
  publicViewsCatalog,
  tagsCatalog,
  tasksCatalog,
  timersCatalog,
  userProfileCatalog,
]);
