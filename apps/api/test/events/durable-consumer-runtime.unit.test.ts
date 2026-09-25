import "reflect-metadata";

import { z } from "zod";

import { DurableConsumerRuntime } from "@/api/platform/events/consumer/durable-consumer-runtime.service";
import { MAX_ATTEMPTS } from "@/api/platform/events/consumer/durable-delivery.constants";
import { EventsDeadLettersRepository } from "@/api/platform/events/dead-letters/events-dead-letters.repository";
import { DecoratedEventHandler } from "@/api/platform/events/decorators/event-handler.types";
import { defineEvent } from "@/api/platform/events/registry/events.registration";
import { DeliveryMode } from "@/api/platform/events/registry/events.types";
import { MessageBusService } from "@/api/platform/jobs/message-bus/message-bus.service";
import { MessageHandler } from "@/api/platform/jobs/message-bus/message-bus.types";

jest.mock("nestjs-context-logger", () => ({
  ContextLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

const TestEvent = defineEvent({
  name: "test.happened",
  schema: z.object({ userId: z.string() }),
  delivery: DeliveryMode.Durable,
});

const GROUP = "test-group";

type JobData = { eventId: string; eventType: string; payload: unknown };

describe("DurableConsumerRuntime", () => {
  let work: MessageHandler<JobData>;
  let handlerFn: jest.Mock;
  let record: jest.Mock;

  const data: JobData = {
    eventId: "event-1",
    eventType: TestEvent.name,
    payload: { userId: "u1" },
  };

  const run = (retryCount: number, jobData: JobData = data) =>
    work(jobData, { retryCount } as Parameters<MessageHandler<JobData>>[1]);

  beforeEach(async () => {
    handlerFn = jest.fn();
    record = jest.fn();

    const bus = {
      work: jest.fn(async (_queue: string, cb: MessageHandler<JobData>) => {
        work = cb;
      }),
    } as unknown as MessageBusService;

    const runtime = new DurableConsumerRuntime(bus, {
      record,
    } as unknown as EventsDeadLettersRepository);

    const decorated: DecoratedEventHandler = {
      className: "TestHandler",
      meta: {
        propertyKey: "onTest",
        event: TestEvent,
        group: { name: GROUP, orderingKeyFn: () => "user:u1" },
      },
      handler: handlerFn,
    };

    await runtime.subscribe(decorated);
    await runtime.start();
  });

  it("invokes the handler with the attempt number", async () => {
    await run(1);

    expect(handlerFn).toHaveBeenCalledWith(
      { userId: "u1" },
      { eventId: "event-1", attempt: 2 },
    );
    expect(record).not.toHaveBeenCalled();
  });

  it("rethrows on a non-terminal failure so pg-boss retries", async () => {
    handlerFn.mockRejectedValue(new Error("boom"));

    await expect(run(MAX_ATTEMPTS - 2)).rejects.toThrow("boom");
    expect(record).not.toHaveBeenCalled();
  });

  it("dead-letters and resolves on the terminal attempt", async () => {
    handlerFn.mockRejectedValue(new Error("boom"));

    await expect(run(MAX_ATTEMPTS - 1)).resolves.toBeUndefined();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        consumerGroup: GROUP,
        eventId: "event-1",
        eventType: TestEvent.name,
        payload: { userId: "u1" },
        attempts: MAX_ATTEMPTS,
        error: expect.stringContaining("boom"),
      }),
    );
  });

  it("treats an invalid payload like any other failure", async () => {
    const invalid = { ...data, payload: { userId: 1 } };

    await expect(run(0, invalid)).rejects.toThrow();
    await expect(run(MAX_ATTEMPTS - 1, invalid)).resolves.toBeUndefined();
    expect(handlerFn).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("treats a missing handler like any other failure", async () => {
    const unknown = { ...data, eventType: "test.unknown" };

    await expect(run(0, unknown)).rejects.toThrow("No handler found");
    await expect(run(MAX_ATTEMPTS - 1, unknown)).resolves.toBeUndefined();
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("dead-letters an abandoned attempt without invoking the handler", async () => {
    await expect(run(MAX_ATTEMPTS)).resolves.toBeUndefined();

    expect(handlerFn).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: MAX_ATTEMPTS,
        error: expect.stringContaining("abandoned"),
      }),
    );
  });
});
