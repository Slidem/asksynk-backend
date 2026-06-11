import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";

import { AsksynkError, ErrorType } from "@/api/common/errors/errors.model";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new ContextLogger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof AsksynkError) {
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
      return;
    }

    // NestJS built-in exceptions (validation 400s, 404s, etc.). Preserve their
    // status + body; only 5xx is worth an error-level log with a stack.
    if (exception instanceof HttpException) {
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
}
