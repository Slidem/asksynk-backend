import "reflect-metadata";

import { Injectable, Type } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DiscoveryModule } from "@nestjs/core";
import { Test } from "@nestjs/testing";

import { CronJob } from "@/api/platform/jobs/cron-job.decorator";
import { buildCronJobDef, defineJob } from "@/api/platform/jobs/define-job";
import { JobContext } from "@/api/platform/jobs/job.types";
import { JobHandler } from "@/api/platform/jobs/job-handler.decorator";
import { JobHandlersRegistry } from "@/api/platform/jobs/job-handlers.registry";
import { MessageBusService } from "@/api/platform/jobs/message-bus/message-bus.service";

jest.mock("nestjs-context-logger", () => ({
  ContextLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

type P = { n: number };

const QueuedDef = defineJob<P>({
  name: "test.registry.queued",
  options: {
    retryLimit: 3,
    retryDelaySeconds: 30,
    retryBackoff: true,
    pollingIntervalSeconds: 1,
    concurrency: 4,
  },
});
const CRON_NAME = "test.registry.cron";
const CRON = "*/5 * * * *";

@Injectable()
class QueuedHandler {
  calls: [P, JobContext][] = [];
  fail = false;

  @JobHandler(QueuedDef)
  async handle(payload: P, ctx: JobContext): Promise<void> {
    this.calls.push([payload, ctx]);
    if (this.fail) throw new Error("boom");
    return Promise.resolve();
  }
}

@Injectable()
class SecondQueuedHandler {
  @JobHandler(QueuedDef)
  async handle(): Promise<void> {
    return Promise.resolve();
  }
}

@Injectable()
class CronHandler {
  calls: [unknown, JobContext][] = [];

  @CronJob({ name: CRON_NAME, cron: CRON })
  async handle(payload: unknown, ctx: JobContext): Promise<void> {
    this.calls.push([payload, ctx]);
    return Promise.resolve();
  }
}

describe("JobHandlersRegistry", () => {
  let schedules: { name: string }[];
  let env: Record<string, string>;
  let bus: {
    ensureQueue: jest.Mock;
    scheduleCron: jest.Mock;
    unscheduleCron: jest.Mock;
    work: jest.Mock;
    getSchedules: jest.Mock;
  };

  beforeEach(() => {
    schedules = [];
    env = {};
    bus = {
      ensureQueue: jest.fn(),
      scheduleCron: jest.fn(),
      unscheduleCron: jest.fn(),
      work: jest.fn(),
      getSchedules: jest.fn(async () => schedules),
    };
  });

  const init = async (providers: Type[]) => {
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [
        JobHandlersRegistry,
        ...providers,
        { provide: MessageBusService, useValue: bus },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => env[key] },
        },
      ],
    }).compile();
    await module.init();
    return module;
  };

  /** The callback `work` received for `name`. */
  const workCb = (name: string) =>
    bus.work.mock.calls.find(([queue]) => queue === name)![1] as (
      data: object,
      job: object,
    ) => Promise<void>;

  it("rejects two handlers for the same def", async () => {
    await expect(init([QueuedHandler, SecondQueuedHandler])).rejects.toThrow(
      'Multiple handlers for job "test.registry.queued"',
    );
  });

  it("rejects two defs with the same name", async () => {
    const Twin = defineJob<P>({ name: QueuedDef.name });

    @Injectable()
    class TwinHandler {
      @JobHandler(Twin)
      async handle(): Promise<void> {
        return Promise.resolve();
      }
    }

    await expect(init([QueuedHandler, TwinHandler])).rejects.toThrow(
      'Conflicting definitions for job "test.registry.queued"',
    );
  });

  it("creates the queue and worker for a queued def", async () => {
    await init([QueuedHandler]);

    expect(bus.ensureQueue).toHaveBeenCalledWith(QueuedDef.name, {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 900,
      deleteAfterSeconds: 172800,
    });
    expect(bus.work).toHaveBeenCalledWith(
      QueuedDef.name,
      expect.any(Function),
      { pollingIntervalSeconds: 1, localConcurrency: 4 },
    );
    expect(bus.scheduleCron).not.toHaveBeenCalled();
  });

  it("schedules the cron for a cron def", async () => {
    await init([CronHandler]);

    expect(bus.scheduleCron).toHaveBeenCalledWith(CRON_NAME, CRON);
  });

  it("unschedules only crons with no def in code", async () => {
    schedules = [{ name: CRON_NAME }, { name: "stale.cron" }];

    await init([CronHandler]);

    expect(bus.unscheduleCron).toHaveBeenCalledTimes(1);
    expect(bus.unscheduleCron).toHaveBeenCalledWith("stale.cron");
  });

  it("skips reconcile on bootstrap when JOBS_RECONCILE_CRONS=false", async () => {
    env.JOBS_RECONCILE_CRONS = "false";
    schedules = [{ name: "stale.cron" }];

    await init([CronHandler]);

    expect(bus.getSchedules).not.toHaveBeenCalled();
    expect(bus.unscheduleCron).not.toHaveBeenCalled();
  });

  describe("assertRegistered", () => {
    it("passes for a registered def, throws otherwise", async () => {
      const module = await init([QueuedHandler]);
      const registry = module.get(JobHandlersRegistry);

      expect(() => registry.assertRegistered(QueuedDef)).not.toThrow();
      const unbound = buildCronJobDef({ name: CRON_NAME, cron: CRON });
      expect(() => registry.assertRegistered(unbound)).toThrow(
        'No handler registered for job "test.registry.cron"',
      );
    });

    it("throws for a different instance with the same name", async () => {
      const module = await init([QueuedHandler]);
      const registry = module.get(JobHandlersRegistry);

      expect(() =>
        registry.assertRegistered(defineJob<P>({ name: QueuedDef.name })),
      ).toThrow("No handler registered");
    });
  });

  describe("run", () => {
    it("passes payload, caller id and attempt from the envelope", async () => {
      const module = await init([QueuedHandler]);

      await workCb(QueuedDef.name)(
        { id: "caller-1", payload: { n: 7 } },
        { id: "pgboss-uuid", retryCount: 1 },
      );

      expect(module.get(QueuedHandler).calls).toEqual([
        [{ n: 7 }, { jobId: "caller-1", attempt: 2 }],
      ]);
    });

    it("passes {} and the pg-boss id for a cron", async () => {
      const module = await init([CronHandler]);

      await workCb(CRON_NAME)({}, { id: "pgboss-uuid", retryCount: 0 });

      expect(module.get(CronHandler).calls).toEqual([
        [{}, { jobId: "pgboss-uuid", attempt: 1 }],
      ]);
    });

    it("rethrows handler failures", async () => {
      const module = await init([QueuedHandler]);
      module.get(QueuedHandler).fail = true;

      await expect(
        workCb(QueuedDef.name)(
          { id: "caller-1", payload: { n: 1 } },
          { id: "pgboss-uuid", retryCount: 3 },
        ),
      ).rejects.toThrow("boom");
    });
  });
});
