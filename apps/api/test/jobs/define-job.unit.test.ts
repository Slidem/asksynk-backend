import { defineCronJob, defineJob } from "@/api/platform/jobs/define-job";
import { DEFAULT_JOB_OPTIONS } from "@/api/platform/jobs/job-options.constants";
import { toJobUuid } from "@/api/platform/jobs/job-uuid";

describe("defineJob / defineCronJob", () => {
  it.each(["timer.completion", "calendar.sync.poll"])(
    "accepts name %s",
    (name) => {
      expect(defineJob({ name }).name).toBe(name);
      expect(defineCronJob({ name, cron: "* * * * *" }).name).toBe(name);
    },
  );

  it.each(["timer", "Timer.x", "timer-completion", "timer."])(
    "rejects name %s",
    (name) => {
      expect(() => defineJob({ name })).toThrow(`Invalid job name "${name}"`);
      expect(() => defineCronJob({ name, cron: "* * * * *" })).toThrow(
        `Invalid job name "${name}"`,
      );
    },
  );

  it("merges options over defaults", () => {
    const job = defineJob({ name: "test.opts", options: { retryLimit: 5 } });

    expect(job.options).toEqual({ ...DEFAULT_JOB_OPTIONS, retryLimit: 5 });
  });

  it("builds a cron def", () => {
    const job = defineCronJob({ name: "test.cron", cron: "*/1 * * * *" });

    expect(job).toMatchObject({ kind: "cron", cron: "*/1 * * * *" });
    expect(job.options).toEqual(DEFAULT_JOB_OPTIONS);
  });

  it("freezes the def", () => {
    expect(Object.isFrozen(defineJob({ name: "test.frozen" }))).toBe(true);
  });
});

describe("toJobUuid", () => {
  it("is deterministic and id-specific", () => {
    expect(toJobUuid("a")).toBe(toJobUuid("a"));
    expect(toJobUuid("a")).not.toBe(toJobUuid("b"));
    expect(toJobUuid("a")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
