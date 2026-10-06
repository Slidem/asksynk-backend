import "reflect-metadata";

import { buildCronJobDef } from "@/api/platform/jobs/define-job";
import {
  EmptyPayload,
  JobHandlerFn,
  JobHandlerMeta,
  JobOptions,
} from "@/api/platform/jobs/job.types";
import { JOB_HANDLER_METADATA } from "@/api/platform/jobs/job-handler.constants";

/** Declares a pg-boss cron and binds the method as its handler. Takes no payload. */
export function CronJob(input: {
  name: string;
  cron: string;
  options?: Partial<JobOptions>;
}): <M extends JobHandlerFn<EmptyPayload>>(
  target: object,
  key: string | symbol,
  descriptor: TypedPropertyDescriptor<M>,
) => void {
  // Built at decoration time, so a bad name throws on import.
  const job = buildCronJobDef(input);

  return (target, propertyKey) => {
    const ctor = target.constructor;
    const list: JobHandlerMeta[] =
      Reflect.getOwnMetadata(JOB_HANDLER_METADATA, ctor) ?? [];

    list.push({ propertyKey: propertyKey as string, job });

    Reflect.defineMetadata(JOB_HANDLER_METADATA, list, ctor);
  };
}
