import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { ContextLogger } from "nestjs-context-logger";
import { catchError, Observable, of } from "rxjs";

import { DomainError } from "@/api/kernel/errors/domain-errors";
import { DomainErrorsTranslator } from "@/api/platform/errors/errors.translator";
import { Ack } from "@/api/platform/realtime/ws-ack";

/**
 * Turns a failed WS command into a `{ ok: false, error }` ack. A thrown error would
 * otherwise become an "exception" event and the client's ack callback never fires.
 */
@Injectable()
export class WsAckInterceptor implements NestInterceptor {
  private readonly logger = new ContextLogger(WsAckInterceptor.name);

  constructor(private readonly errorTranslator: DomainErrorsTranslator) {}

  intercept(_: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(catchError((error: unknown) => of(this.toAck(error))));
  }

  private toAck(error: unknown): Ack {
    if (error instanceof DomainError) {
      return {
        ok: false,
        error: this.errorTranslator.translate(error).message,
      };
    }

    // Validation: first message only — clients get one error at a time.
    if (error instanceof BadRequestException) {
      const { message } = error.getResponse() as {
        message?: string | string[];
      };
      const first = Array.isArray(message) ? message[0] : message;
      return { ok: false, error: first ?? error.message };
    }

    if (error instanceof WsException) {
      const wsError = error.getError();
      if (typeof wsError === "string") {
        return { ok: false, error: wsError };
      }
    }

    this.logger.error("ws command failed", { error });
    return { ok: false, error: "internal_error" };
  }
}
