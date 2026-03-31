import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";

import { AsksynkError, ErrorType } from "@/api/common/errors/errors.model";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof AsksynkError) {
      response.status(exception.statusCode).json({
        error: exception.type,
        statusCode: exception.statusCode,
        message: exception.message,
      });
    } else {
      response.status(500).json({
        error: ErrorType.INTERNAL_SERVER_ERROR,
        statusCode: 500,
        message: "An unexpected error occurred",
      });
    }
  }
}
