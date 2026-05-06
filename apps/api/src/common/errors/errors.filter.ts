import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { ContextLogger } from "nestjs-context-logger";

import { CalendarEventsRepository } from "@/api/calendar-events/repositories/calendar-events.repository";
import { AsksynkError, ErrorType } from "@/api/common/errors/errors.model";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new ContextLogger(CalendarEventsRepository.name);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catch(exception: any, host: ArgumentsHost) {
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
    } else {
      this.logger.error("Unexpected error occurred", {
        error: exception.message,
        stack: exception.stack,
      });
      response.status(500).json({
        error: ErrorType.INTERNAL_SERVER_ERROR,
        statusCode: 500,
        message: "An unexpected error occurred",
      });
    }
  }
}
