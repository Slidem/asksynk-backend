import {
  BadRequestException,
  ExecutionContext,
  SetMetadata,
  createParamDecorator,
} from "@nestjs/common";

import { decodeId } from "@/api/common/utils/hashid";

export const ENCODED_RESPONSE_IDS_KEY = "encodedResponseIds";

/**
 * Marks controller method response fields that should be encoded as hashids.
 * The EncodeIdsInterceptor reads this metadata and encodes the specified fields
 * before the response is sent to the client, ensuring sequential numeric IDs
 * are never exposed to clients.
 *
 * @param fields - field names in the response object to encode (e.g. "id")
 */
export const EncodedResponseIds = (...fields: string[]) =>
  SetMetadata(ENCODED_RESPONSE_IDS_KEY, fields);

/**
 * Extracts a route param and decodes it from a hashid to a numeric string.
 * Use instead of @Param() for ID parameters that are encoded hashids.
 * Returns a string (matching existing service/repo signatures).
 */
export const IdParam = newFunction();
function newFunction() {
  return createParamDecorator(
    (param: string, ctx: ExecutionContext): string => {
      const request = ctx.switchToHttp().getRequest();
      const value = request.params[param];
      try {
        return String(decodeId(value));
      } catch {
        throw new BadRequestException("Invalid ID");
      }
    },
  );
}
