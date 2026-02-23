/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";

import { ENCODED_RESPONSE_IDS_KEY } from "@/api/decorators/id.docorators";
import { Observable } from "rxjs";
import { Reflector } from "@nestjs/core";
import { encodeId } from "@/api/utils/hashid";
import { map } from "rxjs/operators";

/**
 * Important: This interceptor should be used after all other interceptors that modify the response data.
 * It encodes specified ID fields in the response before they are sent to the client.
 * It does not recursively encode nested objects or arrays ! If this is something we want, we need to think of something explicit, maybe something on the response objects themselves
 */
@Injectable()
export class EncodeIdsInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const fields = this.reflector.get<string[]>(
      ENCODED_RESPONSE_IDS_KEY,
      context.getHandler(),
    );

    if (!fields?.length) return next.handle();

    return next.handle().pipe(
      map((data) => {
        if (Array.isArray(data)) {
          return data.map((item) => this.encodeFields(item, fields));
        }
        return this.encodeFields(data, fields);
      }),
    );
  }

  private encodeFields(obj: any, fields: string[]): any {
    if (!obj || typeof obj !== "object") return obj;
    const result = { ...obj };
    for (const field of fields) {
      if (result[field] != null) result[field] = encodeId(result[field]);
    }
    return result;
  }
}
