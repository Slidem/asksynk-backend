import "reflect-metadata";

import {
  JobDef,
  JobHandlerFn,
  JobHandlerMeta,
  JobPayload,
} from "@/api/platform/jobs/job.types";
import { JOB_HANDLER_METADATA } from "@/api/platform/jobs/job-handler.constants";

/** Binds a method to a job def. A wrong payload type fails to compile. Cron handlers may take no args. */
export function JobHandler<T extends JobPayload>(
  job: JobDef<T>,
): <M extends JobHandlerFn<T>>(
  target: object,
  key: string | symbol,
  descriptor: TypedPropertyDescriptor<M>,
) => void {
  return (target, propertyKey) => {
    const ctor = target.constructor;
    const list: JobHandlerMeta[] =
      Reflect.getOwnMetadata(JOB_HANDLER_METADATA, ctor) ?? [];

    list.push({ propertyKey: propertyKey as string, job: job as JobDef });

    Reflect.defineMetadata(JOB_HANDLER_METADATA, list, ctor);
  };
}
