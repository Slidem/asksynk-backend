import { IsIn, IsOptional, IsString } from "class-validator";

import {
  IsIsoDateWithOffset,
  IsUuidV7,
} from "@/api/platform/decorators/fieldValidators.decorators";
import { eventsDeadLetterStatus } from "@/migrations/schema/eventsDeadLetters";

export class ListDeadLettersQueryDto {
  /** Default `pending`. */
  @IsOptional()
  @IsIn(eventsDeadLetterStatus.enumValues)
  status?: (typeof eventsDeadLetterStatus.enumValues)[number];

  @IsOptional()
  @IsString()
  consumerGroup?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  /** Inclusive, on `createdAt`. */
  @IsOptional()
  @IsIsoDateWithOffset()
  from?: string;

  /** Inclusive, on `createdAt`. */
  @IsOptional()
  @IsIsoDateWithOffset()
  to?: string;

  /** Id of the last row of the previous page. */
  @IsOptional()
  @IsUuidV7()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
