import { JobOptions } from "@/api/platform/jobs/job.types";

export const DEFAULT_JOB_OPTIONS: JobOptions = {
  retryLimit: 2,
  retryDelaySeconds: 0,
  retryBackoff: false,
  expireInSeconds: 900,
  deleteAfterSeconds: 3600,
  pollingIntervalSeconds: 2,
  concurrency: 1,
};

/** uuidv5 namespace for job ids. Never change it: it would orphan every pending job. */
export const JOBS_UUID_NAMESPACE = "c645c81b-20b2-40cd-a613-048fed0ecef1";

export const JOB_NAME_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
