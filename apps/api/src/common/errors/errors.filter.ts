import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";
import { ERROR_REGISTRY } from "src/errors/error-registry.root";
import {
  DomainError,
  DomainErrorCategory,
} from "src/kernel/errors/domain-errors";

import { AsksynkError } from "@/api/common/errors/errors.model";

const STATUS_BY_CATEGORY: Record<DomainErrorCategory, number> = {
  INVALID_VALUE: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RULE_VIOLATION: 422,
  INTERNAL: 500,
};
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new ContextLogger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof AsksynkError) {
      this.handleAsksynkError(exception, response);
      return;
    }

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

  /**
   * Old, deprecated AsksynkError handling. Should be removed once all AsksynkErrors are replaced with DomainErrors.
   * @param exception
   * @param response
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleAsksynkError(exception: AsksynkError, response: any) {
    this.logger.warn("AsksynkError occurred", {
      type: exception.type,
      statusCode: exception.statusCode,
      message: exception.message,
      stack: exception.stack,
    });
    response.status(exception.statusCode).json({
      error: exception.type,
      statusCode: exception.statusCode,
      message: exception.message,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleDomainError(exception: DomainError, response: any) {
    const errorDefinition = ERROR_REGISTRY.get(exception.code);
    const category = errorDefinition?.category || DomainErrorCategory.INTERNAL;
    const exposable = errorDefinition?.exposable ?? false;
    const statusCode = STATUS_BY_CATEGORY[category];
    const clientMessage =
      exposable && exception.message
        ? exception.message
        : "A domain error occurred";

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
