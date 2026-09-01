import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";

import { resolveDomainError } from "@/api/errors/resolve-domain-error";
import { DomainError } from "@/api/kernel/errors/domain-errors";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new ContextLogger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof DomainError) {
      this.handleDomainError(exception, response);
      return;
    }

    if (exception instanceof HttpException) {
      this.handleNestJsHttpError(exception, response);
      return;
    }

    const err = exception as { message?: string; stack?: string };

    this.logger.error("Unexpected error occurred", {
      error: err?.message,
      stack: err?.stack,
    });

    response.status(500).json({
      error: "internal",
      statusCode: 500,
      message: "An unexpected error occurred",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleDomainError(exception: DomainError, response: any) {
    const {
      category,
      statusCode,
      message: clientMessage,
    } = resolveDomainError(exception);

    if (statusCode >= 500) {
      this.logger.error("DomainError occurred", {
        category,
        statusCode,
        code: exception.code,
        message: exception.message,
        stack: exception.stack,
      });
    } else {
      this.logger.debug("DomainError occurred", {
        category,
        statusCode,
        code: exception.code,
        message: exception.message,
      });
    }

    response.status(statusCode).json({
      statusCode,
      error: exception.code,
      message: clientMessage,
    });
  }

  /**
   * NestJS built-in exceptions (validation 400s, 404s, etc.).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleNestJsHttpError(exception: HttpException, response: any) {
    const statusCode = exception.getStatus();
    if (statusCode >= 500) {
      this.logger.error("HTTP exception", {
        statusCode,
        message: exception.message,
        stack: exception.stack,
      });
    } else {
      this.logger.warn("HTTP exception", {
        statusCode,
        message: exception.message,
      });
    }
    response.status(statusCode).json(exception.getResponse());
  }
}
