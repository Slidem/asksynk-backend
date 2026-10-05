import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { DiscoveryService, MetadataScanner } from "@nestjs/core";
import { ContextLogger } from "nestjs-context-logger";
import { JobWithMetadata } from "pg-boss";

import {
  JobDef,
  JobEnvelope,
  JobHandlerFn,
  JobHandlerMeta,
  JobOptions,
  JobPayload,
} from "@/api/platform/jobs/job.types";
import { JOB_HANDLER_METADATA } from "@/api/platform/jobs/job-handler.constants";
import { MessageBusService } from "@/api/platform/jobs/message-bus/message-bus.service";

type RegisteredHandler = { def: JobDef; fn: JobHandlerFn<JobPayload> };

@Injectable()
export class JobHandlersRegistry implements OnApplicationBootstrap {
  private readonly logger = new ContextLogger(JobHandlersRegistry.name);
  private readonly handlers = new Map<string, RegisteredHandler>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly bus: MessageBusService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.discover();

    for (const { def, fn } of this.handlers.values()) {
      await this.bus.ensureQueue(def.name, toQueueOptions(def.options));
      if (def.kind === "cron") {
        await this.bus.scheduleCron(def.name, def.cron);
      }
      await this.bus.work(
        def.name,
        (data, job) => this.run(def, fn, data, job),
        {
          pollingIntervalSeconds: def.options.pollingIntervalSeconds,
          localConcurrency: def.options.concurrency,
        },
      );
    }

    await this.reconcileCrons();
  }

  /** Unschedules pg-boss schedules that have no cron def in code. Public for the integration test. */
  async reconcileCrons(): Promise<void> {
    const crons = new Set(
      [...this.handlers.values()]
        .filter((h) => h.def.kind === "cron")
        .map((h) => h.def.name),
    );

    for (const schedule of await this.bus.getSchedules()) {
      if (!crons.has(schedule.name)) {
        await this.bus.unscheduleCron(schedule.name);
        this.logger.warn("unscheduled cron with no def in code", {
          name: schedule.name,
        });
      }
    }
  }

  assertRegistered(def: JobDef): void {
    if (this.handlers.get(def.name)?.def !== def) {
      throw new Error(`No handler registered for job "${def.name}"`);
    }
  }

  private discover(): void {
    for (const { instance, metatype } of this.discovery.getProviders()) {
      if (!instance || !metatype) continue;

      const list = Reflect.getOwnMetadata(JOB_HANDLER_METADATA, metatype) as
        | JobHandlerMeta[]
        | undefined;

      if (!list || list.length === 0) continue;

      const className = metatype.name;
      const prototype = Object.getPrototypeOf(instance) as object;
      const methodNames = new Set(
        this.metadataScanner.getAllMethodNames(prototype),
      );

      for (const { propertyKey, job } of list) {
        if (!methodNames.has(propertyKey)) {
          throw new Error(
            `@JobHandler method "${propertyKey}" not found on ${className}.`,
          );
        }
        const fn = (instance as Record<string, unknown>)[propertyKey];
        if (typeof fn !== "function") {
          throw new Error(
            `@JobHandler target ${className}.${propertyKey} is not a function.`,
          );
        }

        const existing = this.handlers.get(job.name);
        if (existing) {
          throw new Error(
            existing.def === job
              ? `Multiple handlers for job "${job.name}"`
              : `Conflicting definitions for job "${job.name}"`,
          );
        }

        this.handlers.set(job.name, {
          def: job,
          fn: (fn as JobHandlerFn<JobPayload>).bind(instance),
        });
      }
    }
  }

  private async run(
    def: JobDef,
    fn: JobHandlerFn<JobPayload>,
    data: object,
    job: JobWithMetadata<object>,
  ): Promise<void> {
    const attempt = job.retryCount + 1;
    const envelope = data as JobEnvelope;
    const jobId = def.kind === "cron" ? job.id : envelope.id;
    const payload = def.kind === "cron" ? {} : envelope.payload;

    try {
      await fn(payload, { jobId, attempt });
    } catch (error) {
      const final = job.retryCount >= def.options.retryLimit;
      const log = { job: def.name, jobId, attempt, error };
      if (final) {
        this.logger.error("job failed permanently", log);
      } else {
        this.logger.warn("job failed, retrying", log);
      }
      throw error;
    }
  }
}

function toQueueOptions(o: JobOptions) {
  return {
    retryLimit: o.retryLimit,
    retryDelay: o.retryDelaySeconds,
    retryBackoff: o.retryBackoff,
    expireInSeconds: o.expireInSeconds,
    deleteAfterSeconds: o.deleteAfterSeconds,
  };
}
