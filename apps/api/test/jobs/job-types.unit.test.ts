import { defineCronJob, defineJob } from "@/api/platform/jobs/define-job";
import { JobHandler } from "@/api/platform/jobs/job-handler.decorator";
import { JobScheduler } from "@/api/platform/jobs/job-scheduler";

/**
 * Compile-time spec. ts-jest type-checks this file, so an unused
 * `@ts-expect-error` fails it. `spec` is never called.
 */
type P = { a: string };
const Def = defineJob<P>({ name: "test.types" });
const CronDef = defineCronJob({ name: "test.types_cron", cron: "* * * * *" });
declare const s: JobScheduler;

function spec() {
  s.schedule(Def, { a: "x" }, { id: "1" });
  // @ts-expect-error wrong payload field
  s.schedule(Def, { b: "x" }, { id: "1" });
  // @ts-expect-error missing id
  s.schedule(Def, { a: "x" }, {});
  // @ts-expect-error Date is not JSON
  defineJob<{ at: Date }>({ name: "test.date" });
  // @ts-expect-error cron defs can't be scheduled
  s.schedule(CronDef, {}, { id: "1" });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  class H {
    @JobHandler(Def)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ok(p: P) {
      return Promise.resolve();
    }
    @JobHandler(CronDef)
    cron() {
      return Promise.resolve();
    }
    // @ts-expect-error handler payload mismatch
    @JobHandler(Def)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    bad(p: { z: number }) {
      return Promise.resolve();
    }
  }
}

describe("job types", () => {
  it("compiles", () => {
    expect(spec).toBeDefined();
  });
});
