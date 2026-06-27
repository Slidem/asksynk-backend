import { applyDecorators } from "@nestjs/common";
import { ApiProperty, ApiResponse } from "@nestjs/swagger";

import { ErrorType } from "@/api/common/errors/errors.model";

export class ApiErrorDto {
  /** Machine-readable error type. */
  @ApiProperty({ enum: ErrorType, enumName: "ErrorType" })
  error!: ErrorType;

  /** HTTP status code, mirrored in the response body. */
  @ApiProperty({ example: 400 })
  statusCode!: number;

  /** Human-readable error message. */
  @ApiProperty()
  message!: string;
}

/** Documents the global exception-filter error envelope shared by every route. */
export function ApiStandardErrors() {
  return applyDecorators(
    ApiResponse({ status: 400, description: "Bad Request", type: ApiErrorDto }),
    ApiResponse({
      status: 401,
      description: "Unauthorized",
      type: ApiErrorDto,
    }),
    ApiResponse({ status: 403, description: "Forbidden", type: ApiErrorDto }),
    ApiResponse({ status: 404, description: "Not Found", type: ApiErrorDto }),
    ApiResponse({
      status: 500,
      description: "Internal Server Error",
      type: ApiErrorDto,
    }),
  );
}
