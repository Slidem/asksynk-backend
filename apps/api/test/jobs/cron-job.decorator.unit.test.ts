import "reflect-metadata";

import { CronJob } from "@/api/platform/jobs/cron-job.decorator";
import { JobHandlerMeta } from "@/api/platform/jobs/job.types";
import { JOB_HANDLER_METADATA } from "@/api/platform/jobs/job-handler.constants";
import { DEFAULT_JOB_OPTIONS } from "@/api/platform/jobs/job-options.constants";

describe("@CronJob", () => {
  it("records a cron def with options merged over defaults", () => {
    class H {
      @CronJob({
        name: "test.cron_decorator",
        cron: "*/5 * * * *",
        options: { retryLimit: 0 },
      })
      async run(): Promise<void> {
        return Promise.resolve();
      }
    }

    const list = Reflect.getOwnMetadata(JOB_HANDLER_METADATA, H) as
      | JobHandlerMeta[]
      | undefined;

    expect(list).toHaveLength(1);
    expect(list![0].propertyKey).toBe("run");
    expect(list![0].job).toEqual({
      kind: "cron",
      name: "test.cron_decorator",
      cron: "*/5 * * * *",
      options: { ...DEFAULT_JOB_OPTIONS, retryLimit: 0 },
    });
  });

  it("rejects an invalid name at decoration time", () => {
    expect(() => CronJob({ name: "bad-name", cron: "* * * * *" })).toThrow(
      'Invalid job name "bad-name"',
    );
  });
});
