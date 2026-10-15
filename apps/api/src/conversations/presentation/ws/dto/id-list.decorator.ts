import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsArray, IsOptional, IsString } from "class-validator";
import _ from "lodash";

/** Optional, deduped `string[]`; one message for every failure (WS ack string). */
export const IsIdList = (field: string) =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }) => (Array.isArray(value) ? _.uniq(value) : value)),
    IsArray({ message: `${field} must be string[]` }),
    IsString({ each: true, message: `${field} must be string[]` }),
  );
