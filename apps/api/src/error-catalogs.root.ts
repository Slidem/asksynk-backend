import { attentionItemsCatalog } from "@/api/attention/attention.errors";
import { messagingCatalog } from "@/api/conversations/conversations.errors";
import { storageCatalog } from "@/api/files/files.errors";
import { timersCatalog } from "@/api/focus/focus.errors";
import { ErrorCatalog } from "@/api/kernel/errors/error-catalog";
import { coreErrorsCatalog } from "@/api/kernel/errors/kernel.errors";
import { networksCatalog } from "@/api/network/network.errors";
import { deadLettersCatalog } from "@/api/platform/events/dead-letters/dead-letters.errors";
import { calendarEventsCatalog } from "@/api/scheduling/calendar-events.errors";
import { calendarIntegrationsCatalog } from "@/api/scheduling/calendar-integration.errors";
import { publicViewsCatalog } from "@/api/sharing/sharing.errors";
import { tagsCatalog } from "@/api/tagging/tagging.errors";
import { tasksCatalog } from "@/api/tasks/tasks.errors";
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
