import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";
import {
  DomainError,
  DomainErrorCategory,
} from "src/kernel/errors/domain-errors";

import { AsksynkError, ErrorType } from "@/api/common/errors/errors.model";

const STATUS_BY_CATEGORY: Record<DomainErrorCategory, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
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
      error: ErrorType.INTERNAL_SERVER_ERROR,
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
    const statusCode = STATUS_BY_CATEGORY[exception.category] || 500;
    if (statusCode >= 500) {
      this.logger.error("DomainError occurred", {
        category: exception.category,
        code: exception.code,
        params: exception.params,
        statusCode,
        message: exception.message,
        stack: exception.stack,
      });
    } else {
      this.logger.debug("DomainError occurred", {
        category: exception.category,
        code: exception.code,
        params: exception.params,
        statusCode,
        message: exception.message,
      });
    }
    response.status(statusCode).json({
      error: exception.code,
      statusCode,
      message: exception.message || "A domain error occurred",
    });
  }

  /**
   *
   * NestJS built-in exceptions (validation 400s, 404s, etc.).
   *
   * @param exception
   * @param response
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
