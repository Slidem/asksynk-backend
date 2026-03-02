export enum ErrorType {
  NOT_FOUND = "NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  BAD_REQUEST = "BAD_REQUEST",
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
}

export class AsksynkError extends Error {
  constructor(
    public type: ErrorType,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AsksynkError";
  }

  get statusCode(): number {
    switch (this.type) {
      case ErrorType.NOT_FOUND:
        return 404;
      case ErrorType.UNAUTHORIZED:
        return 401;
      case ErrorType.FORBIDDEN:
        return 403;
      case ErrorType.BAD_REQUEST:
        return 400;
      case ErrorType.INTERNAL_SERVER_ERROR:
        return 500;
      default:
        return 500;
    }
  }

  static notFound(message: string, options?: ErrorOptions): AsksynkError {
    return new AsksynkError(ErrorType.NOT_FOUND, message, options);
  }

  static unauthorized(message: string, options?: ErrorOptions): AsksynkError {
    return new AsksynkError(ErrorType.UNAUTHORIZED, message, options);
  }

  static forbidden(message: string, options?: ErrorOptions): AsksynkError {
    return new AsksynkError(ErrorType.FORBIDDEN, message, options);
  }

  static badRequest(message: string, options?: ErrorOptions): AsksynkError {
    return new AsksynkError(ErrorType.BAD_REQUEST, message, options);
  }

  static internalServerError(
    message: string,
    options?: ErrorOptions,
  ): AsksynkError {
    return new AsksynkError(ErrorType.INTERNAL_SERVER_ERROR, message, options);
  }
}
