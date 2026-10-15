import "reflect-metadata";

import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
} from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { lastValueFrom, of, throwError } from "rxjs";

import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";
import { DomainErrorsTranslator } from "@/api/platform/errors/errors.translator";
import { WsAckInterceptor } from "@/api/platform/realtime/ws-ack.interceptor";

jest.mock("nestjs-context-logger", () => ({
  ContextLogger: jest.fn().mockImplementation(() => ({ error: jest.fn() })),
}));

const { catalog, createError } = defineCatalog("test", {
  exposed: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "nope { id }",
  },
  hidden: {
    category: DomainErrorCategory.INTERNAL,
    exposable: false,
    message: "secret",
  },
});

describe("WsAckInterceptor", () => {
  const interceptor = new WsAckInterceptor(
    new DomainErrorsTranslator([catalog]),
  );
  const run = (handler: CallHandler) =>
    lastValueFrom(interceptor.intercept({} as ExecutionContext, handler));
  const failWith = (error: unknown) =>
    run({ handle: () => throwError(() => error) });

  it("passes a successful ack through", async () => {
    expect(await run({ handle: () => of({ ok: true }) })).toEqual({
      ok: true,
    });
  });

  it("exposable DomainError → its message", async () => {
    expect(await failWith(createError("exposed", { id: "x" }))).toEqual({
      ok: false,
      error: "nope x",
    });
  });

  it("non-exposable DomainError → generic message", async () => {
    expect(await failWith(createError("hidden"))).toEqual({
      ok: false,
      error: "A domain error occurred",
    });
  });

  it("validation error → first message only", async () => {
    expect(
      await failWith(new BadRequestException(["first", "second"])),
    ).toEqual({ ok: false, error: "first" });
  });

  it("WsException → its message", async () => {
    expect(await failWith(new WsException("unauthorized"))).toEqual({
      ok: false,
      error: "unauthorized",
    });
  });

  it("anything else → internal_error", async () => {
    expect(await failWith(new Error("boom"))).toEqual({
      ok: false,
      error: "internal_error",
    });
  });
});
