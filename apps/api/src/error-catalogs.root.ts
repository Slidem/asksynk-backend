import { attentionItemsCatalog } from "@/api/attention-items/attention-items.errors";
import { calendarEventsCatalog } from "@/api/calendar-events/calendar-events.errors";
import { calendarIntegrationsCatalog } from "@/api/calendar-integrations/calendar-integration.errors";
import { ErrorCatalog } from "@/api/kernel/errors/error-catalog";
import { coreErrorsCatalog } from "@/api/kernel/errors/kernel.errors";
import { messagingCatalog } from "@/api/messaging/messaging.errors";
import { networksCatalog } from "@/api/networks/networks.errors";
import { deadLettersCatalog } from "@/api/platform/events/dead-letters/dead-letters.errors";
import { publicViewsCatalog } from "@/api/public-views/public-views.errors";
import { tagsCatalog } from "@/api/tags/tags.errors";
import { tasksCatalog } from "@/api/tasks/tasks.errors";
import { timersCatalog } from "@/api/timers/timers.errors";
import { userProfileCatalog } from "@/api/user-profile/user-profile.errors";

/** Composition root: every context's catalog. Register new catalogs here. */
export const ERROR_CATALOGUES: ErrorCatalog[] = [
  coreErrorsCatalog,
  attentionItemsCatalog,
  calendarEventsCatalog,
  calendarIntegrationsCatalog,
  deadLettersCatalog,
  messagingCatalog,
  networksCatalog,
  publicViewsCatalog,
  tagsCatalog,
  tasksCatalog,
  timersCatalog,
  userProfileCatalog,
];
