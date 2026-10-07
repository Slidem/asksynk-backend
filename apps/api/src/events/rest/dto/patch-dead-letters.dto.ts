import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

import { DEAD_LETTER_TRANSITIONS } from "@/api/events/rest/dto/patch-dead-letter.dto";
import {
  IsIsoDateWithOffset,
  IsUuidV7,
} from "@/api/platform/decorators/fieldValidators.decorators";
import {
  DEAD_LETTERS_BULK_MAX,
  DeadLetterTransition,
} from "@/api/platform/events/dead-letters/events-dead-letters.service";

export class DeadLetterFilterDto {
  @IsOptional()
  @IsString()
  consumerGroup?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsIsoDateWithOffset()
  from?: string;

  @IsOptional()
  @IsIsoDateWithOffset()
  to?: string;
}

/** Exactly one of `ids` / `filter` (checked by the service). Filter mode only touches `pending` rows. */
export class PatchDeadLettersRequestDto {
  @IsIn(DEAD_LETTER_TRANSITIONS)
  status!: DeadLetterTransition;

  @IsOptional()
  @IsArray()
  @IsUuidV7({ each: true })
  ids?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DeadLetterFilterDto)
  filter?: DeadLetterFilterDto;

  /** Filter mode only. Rows beyond it stay `pending`; call again to continue. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(DEAD_LETTERS_BULK_MAX)
  limit?: number;
}
