/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";

import { ENCODED_RESPONSE_IDS_KEY } from "@/api/common/decorators/id.decorators";
import { Observable } from "rxjs";
import { Reflector } from "@nestjs/core";
import { encodeId } from "@/api/common/utils/hashid";
import { map } from "rxjs/operators";

/**
 * Important: This interceptor should be used after all other interceptors that modify the response data.
 * It encodes specified ID fields in the response before they are sent to the client.
 * Supports dot-path notation for nested fields (e.g. "questions.id", "questions.answers.id").
 * Arrays encountered along the path are auto-traversed.
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
    const result = Array.isArray(obj) ? [...obj] : { ...obj };
    for (const field of fields) {
      this.encodeAtPath(result, field.split("."));
    }
    return result;
  }

  private encodeAtPath(obj: any, parts: string[]): void {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      obj.forEach((item) => this.encodeAtPath(item, parts));
      return;
    }

    const [head, ...rest] = parts;
    if (rest.length === 0) {
      if (obj[head] != null) obj[head] = encodeId(obj[head]);
    } else {
      this.encodeAtPath(obj[head], rest);
    }
  }
}
