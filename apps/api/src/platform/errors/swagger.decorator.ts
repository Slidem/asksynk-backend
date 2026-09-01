import { applyDecorators } from "@nestjs/common";
import { ApiProperty, ApiResponse } from "@nestjs/swagger";

export class ApiErrorDto {
  /** Machine-readable error code, namespaced by bounded context. */
  @ApiProperty({ example: "tasks.task_not_found" })
  error!: string;

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
    ApiResponse({ status: 409, description: "Conflict", type: ApiErrorDto }),
    ApiResponse({
      status: 422,
      description: "Unprocessable Entity",
      type: ApiErrorDto,
    }),
    ApiResponse({
      status: 500,
      description: "Internal Server Error",
      type: ApiErrorDto,
    }),
  );
}
