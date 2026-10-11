import { attentionItemsCatalog } from "@/api/attention-items/attention-items.errors";
import { ErrorCatalog } from "@/api/kernel/errors/error-catalog";
import { coreErrorsCatalog } from "@/api/kernel/errors/kernel.errors";
import { messagingCatalog } from "@/api/messaging/messaging.errors";
import { networksCatalog } from "@/api/networks/networks.errors";
import { deadLettersCatalog } from "@/api/platform/events/dead-letters/dead-letters.errors";
import { publicViewsCatalog } from "@/api/public-views/public-views.errors";
import { calendarEventsCatalog } from "@/api/scheduling/calendar-events.errors";
import { calendarIntegrationsCatalog } from "@/api/scheduling/calendar-integration.errors";
import { storageCatalog } from "@/api/storage/storage.errors";
import { tagsCatalog } from "@/api/tagging/tagging.errors";
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
  storageCatalog,
  tagsCatalog,
  tasksCatalog,
  timersCatalog,
  userProfileCatalog,
];
