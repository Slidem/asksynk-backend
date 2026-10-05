import { v5 as uuidv5 } from "uuid";

import { JOBS_UUID_NAMESPACE } from "@/api/platform/jobs/job-options.constants";

/** Same caller id → same pg-boss row. */
export function toJobUuid(id: string): string {
  return uuidv5(id, JOBS_UUID_NAMESPACE);
}
