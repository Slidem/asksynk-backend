import {
  CronJobDef,
  JobOptions,
  JobPayload,
  QueuedJobDef,
} from "@/api/platform/jobs/job.types";
import {
  DEFAULT_JOB_OPTIONS,
  JOB_NAME_PATTERN,
} from "@/api/platform/jobs/job-options.constants";

export function defineJob<T extends JobPayload>(input: {
  name: string;
  options?: Partial<JobOptions>;
}): QueuedJobDef<T> {
  assertValidName(input.name);

  return Object.freeze({
    kind: "queued",
    name: input.name,
    options: { ...DEFAULT_JOB_OPTIONS, ...input.options },
  });
}

/** Cron syntax is checked at bootstrap by `MessageBusService.scheduleCron`. */
export function defineCronJob(input: {
  name: string;
  cron: string;
  options?: Partial<JobOptions>;
}): CronJobDef {
  assertValidName(input.name);

  return Object.freeze({
    kind: "cron",
    name: input.name,
    cron: input.cron,
    options: { ...DEFAULT_JOB_OPTIONS, ...input.options },
  });
}

function assertValidName(name: string): void {
  if (!JOB_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid job name "${name}". Must be dotted lowercase, e.g. "timer.completion".`,
    );
  }
}
