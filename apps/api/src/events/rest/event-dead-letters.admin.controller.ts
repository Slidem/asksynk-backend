import { Body, Controller, Get, Patch, Query } from "@nestjs/common";

import { AdminApi } from "@/api/auth/admin-api.decorator";
import { ListDeadLettersQueryDto } from "@/api/events/rest/dto/list-dead-letters-query.dto";
import { PatchDeadLetterRequestDto } from "@/api/events/rest/dto/patch-dead-letter.dto";
import {
  DeadLetterFilterDto,
  PatchDeadLettersRequestDto,
} from "@/api/events/rest/dto/patch-dead-letters.dto";
import { toDeadLetterResponse } from "@/api/events/rest/mappers/dead-letter.mapper";
import {
  DeadLetterResponse,
  DeadLetterTransitionResponse,
} from "@/api/events/rest/responses/dead-letter.response";
import { UuidV7Param } from "@/api/platform/decorators/paramValidators.decorators";
import { DeadLetterFilter } from "@/api/platform/events/dead-letters/events-dead-letters.repository";
import { EventsDeadLettersService } from "@/api/platform/events/dead-letters/events-dead-letters.service";
import { toNonNegativeNumberOptional } from "@/api/platform/mappers/string.utils";

@AdminApi()
@Controller("admin/events/dead-letters")
export class EventDeadLettersAdminController {
  constructor(private readonly deadLetters: EventsDeadLettersService) {}

  /** List dead letters, newest first. Defaults to `pending`. */
  @Get()
  async list(
    @Query() query: ListDeadLettersQueryDto,
  ): Promise<DeadLetterResponse[]> {
    const rows = await this.deadLetters.list({
      status: query.status ?? "pending",
      ...toFilter(query),
      cursor: query.cursor,
      limit: toNonNegativeNumberOptional(query.limit),
    });
    return rows.map(toDeadLetterResponse);
  }

  /** Replay or discard every pending dead letter in `ids`, or up to `limit` matching `filter`. */
  @Patch()
  async patchMany(
    @Body() body: PatchDeadLettersRequestDto,
  ): Promise<DeadLetterTransitionResponse> {
    return this.deadLetters.transitionBulk(
      {
        ids: body.ids,
        filter: body.filter ? toFilter(body.filter) : undefined,
        limit: body.limit,
      },
      body.status,
    );
  }

  /** Replay or discard one pending dead letter. */
  @Patch(":id")
  async patchOne(
    @UuidV7Param("id") id: string,
    @Body() body: PatchDeadLetterRequestDto,
  ): Promise<DeadLetterTransitionResponse> {
    return this.deadLetters.transitionOne(id, body.status);
  }
}

function toFilter(f: DeadLetterFilterDto): DeadLetterFilter {
  return {
    consumerGroup: f.consumerGroup,
    eventType: f.eventType,
    from: f.from ? new Date(f.from) : undefined,
    to: f.to ? new Date(f.to) : undefined,
  };
}
