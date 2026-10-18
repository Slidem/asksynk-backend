import { AggregateRoot } from "@/api/kernel/domain/aggregate-root";
import {
  concurrencyConflictError,
  invalidValueError,
  isConcurrencyConflict,
} from "@/api/kernel/errors/kernel.errors";

class Counter extends AggregateRoot<{ type: "incremented"; value: number }> {
  private value = 0;

  constructor(version: number) {
    super(version);
  }

  increment(): void {
    this.value += 1;
    this.record({ type: "incremented", value: this.value });
  }
}

describe("AggregateRoot", () => {
  it("returns recorded events in order and clears them", () => {
    const counter = new Counter(1);
    counter.increment();
    counter.increment();

    expect(counter.pullEvents()).toEqual([
      { type: "incremented", value: 1 },
      { type: "incremented", value: 2 },
    ]);
    expect(counter.pullEvents()).toEqual([]);
  });

  it("bumps the version on markSaved", () => {
    const counter = new Counter(3);
    counter.markSaved();
    expect(counter.version).toBe(4);
  });
});

describe("isConcurrencyConflict", () => {
  it("matches only core.concurrency_conflict", () => {
    expect(isConcurrencyConflict(concurrencyConflictError())).toBe(true);
    expect(isConcurrencyConflict(invalidValueError("x"))).toBe(false);
    expect(isConcurrencyConflict(new Error("x"))).toBe(false);
  });
});
