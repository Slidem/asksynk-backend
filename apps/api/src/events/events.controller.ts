import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import {
  EncodedResponseIds,
  IdParam,
} from "@/api/common/decorators/id.decorators";
import { AsksynkError } from "@/api/common/errors/errors.model";
import {
  toNonNegativeNumberOptional,
  toOptionalBoolean,
  toOptionalDate,
  toOptionalStringArray,
} from "@/api/common/utils/inputs";
import {
  toEventResponseDto,
  toRecurrenceWithEventsResponseDto,
} from "@/api/events/events.mappers";
import { RecurrenceType } from "@/api/events/events.model";
import {
  CreateEventRequestDto,
  CreateRecurringEventsRequestDto,
  EventResponseDto,
  ListEventsQueryDto,
  RecurrenceWithEventsResponseDto,
  UpdateEventRequestDto,
  UpdateRecurrenceEventsRequestDto,
} from "@/api/events/events.rest-dto";
import { EventsService } from "@/api/events/events.service";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { includes, isEmpty, toNumber, trim } from "lodash";

const VALID_RECURRENCE_TYPES: RecurrenceType[] = [
  "daily",
  "weekdays",
  "weekly",
  "bi-weekly",
  "monthly",
];

@Controller("events")
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // --- Single event endpoints ---
  @Post()
  @EncodedResponseIds("id", "recurrenceId")
  async createEvent(
    @Body() dto: CreateEventRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto> {
    this.validateCreateEventDto(dto);

    const event = await this.eventsService.createEvent({
      userId: user.id,
      name: dto.name,
      start: new Date(dto.start),
      end: new Date(dto.end),
      tagIds: dto.tagIds,
    });

    return toEventResponseDto(event);
  }

  @Get()
  @EncodedResponseIds("id", "recurrenceId")
  async listEvents(
    @Query() query: ListEventsQueryDto,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto[]> {
    this.validateListEventsQuery(query);

    const limit = toNonNegativeNumberOptional(query.limit);
    const offset = toNonNegativeNumberOptional(query.offset);

    const events = await this.eventsService.listEvents(user.id, {
      startDate: toOptionalDate(query.startDate),
      endDate: toOptionalDate(query.endDate),
      tagIds: toOptionalStringArray(query.tagIds),
      hasRecurrence: toOptionalBoolean(query.hasRecurrence),
      orderBy: query.orderBy,
      orderDirection: query.orderDirection,
      limit,
      offset,
    });

    return events.map(toEventResponseDto);
  }

  @Get(":id")
  @EncodedResponseIds("id", "recurrenceId")
  async getEvent(
    @IdParam("id") eventId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto> {
    const event = await this.eventsService.getEventById(user.id, eventId);
    return toEventResponseDto(event);
  }

  @Patch(":id")
  @EncodedResponseIds("id", "recurrenceId")
  async updateEvent(
    @IdParam("id") eventId: string,
    @Body() dto: UpdateEventRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto> {
    this.validateUpdateEventDto(dto);

    const event = await this.eventsService.updateEvent({
      userId: user.id,
      eventId,
      name: dto.name,
      start: toOptionalDate(dto.start),
      end: toOptionalDate(dto.end),
      removeRecurrence: dto.removeRecurrence,
      tagIds: dto.tagIds,
    });

    return toEventResponseDto(event);
  }

  @Delete(":id")
  @EncodedResponseIds("id", "recurrenceId")
  async deleteEvent(
    @IdParam("id") eventId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto> {
    const event = await this.eventsService.deleteEvent(user.id, eventId);
    return toEventResponseDto(event);
  }

  // --- Recurrence endpoints ---
  @Post("recurrences")
  @EncodedResponseIds("recurrence.id", "events.id", "events.recurrenceId")
  async createRecurringEvents(
    @Body() dto: CreateRecurringEventsRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<RecurrenceWithEventsResponseDto> {
    this.validateCreateRecurringEventsDto(dto);

    const result = await this.eventsService.createRecurringEvents({
      userId: user.id,
      name: dto.name,
      recurrenceType: dto.recurrenceType,
      start: new Date(dto.start),
      end: new Date(dto.end),
      until: toOptionalDate(dto.until),
      tagIds: dto.tagIds,
    });

    return toRecurrenceWithEventsResponseDto(result.recurrence, result.events);
  }

  @Get("recurrences/:id")
  @EncodedResponseIds("recurrence.id", "events.id", "events.recurrenceId")
  async getRecurrence(
    @IdParam("id") recurrenceId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<RecurrenceWithEventsResponseDto> {
    const result = await this.eventsService.getRecurrenceWithEvents(
      user.id,
      recurrenceId,
    );
    return toRecurrenceWithEventsResponseDto(result.recurrence, result.events);
  }

  @Patch("recurrences/:id")
  @EncodedResponseIds("recurrence.id", "events.id", "events.recurrenceId")
  async updateRecurrenceEvents(
    @IdParam("id") recurrenceId: string,
    @Body() dto: UpdateRecurrenceEventsRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<RecurrenceWithEventsResponseDto> {
    this.validateUpdateRecurrenceDto(dto);

    const result = await this.eventsService.updateRecurrenceEvents({
      userId: user.id,
      recurrenceId,
      name: dto.name,
      start: toOptionalDate(dto.start),
      end: toOptionalDate(dto.end),
      tagIds: dto.tagIds,
    });

    return toRecurrenceWithEventsResponseDto(result.recurrence, result.events);
  }

  @Delete("recurrences/:id")
  async deleteRecurrenceEvents(
    @IdParam("id") recurrenceId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<{ success: boolean }> {
    await this.eventsService.deleteRecurrenceEvents(user.id, recurrenceId);
    return { success: true };
  }

  // --- Validation ---
  private validateCreateEventDto(dto: CreateEventRequestDto): void {
    if (!dto.name || isEmpty(trim(dto.name))) {
      throw AsksynkError.badRequest("Event name is required");
    }
    if (!dto.start || !this.isValidDate(dto.start)) {
      throw AsksynkError.badRequest("Valid start date is required");
    }
    if (!dto.end || !this.isValidDate(dto.end)) {
      throw AsksynkError.badRequest("Valid end date is required");
    }
  }

  private validateCreateRecurringEventsDto(
    dto: CreateRecurringEventsRequestDto,
  ): void {
    if (!dto.name || isEmpty(trim(dto.name))) {
      throw AsksynkError.badRequest("Event name is required");
    }
    if (!dto.start || !this.isValidDate(dto.start)) {
      throw AsksynkError.badRequest("Valid start date is required");
    }
    if (!dto.end || !this.isValidDate(dto.end)) {
      throw AsksynkError.badRequest("Valid end date is required");
    }
    this.validateRecurrenceType(dto.recurrenceType);
    if (dto.until && !this.isValidDate(dto.until)) {
      throw AsksynkError.badRequest("Invalid until date");
    }
  }

  private validateUpdateEventDto(dto: UpdateEventRequestDto): void {
    if (dto.name !== undefined && isEmpty(trim(dto.name))) {
      throw AsksynkError.badRequest("Event name cannot be empty");
    }
    if (dto.start !== undefined && !this.isValidDate(dto.start)) {
      throw AsksynkError.badRequest("Invalid start date");
    }
    if (dto.end !== undefined && !this.isValidDate(dto.end)) {
      throw AsksynkError.badRequest("Invalid end date");
    }
  }

  private validateUpdateRecurrenceDto(
    dto: UpdateRecurrenceEventsRequestDto,
  ): void {
    if (dto.name !== undefined && isEmpty(trim(dto.name))) {
      throw AsksynkError.badRequest("Event name cannot be empty");
    }
    if (dto.start !== undefined && !this.isValidDate(dto.start)) {
      throw AsksynkError.badRequest("Invalid start date");
    }
    if (dto.end !== undefined && !this.isValidDate(dto.end)) {
      throw AsksynkError.badRequest("Invalid end date");
    }
  }

  private validateListEventsQuery(query: ListEventsQueryDto): void {
    if (query.startDate && !this.isValidDate(query.startDate)) {
      throw AsksynkError.badRequest("Invalid startDate");
    }
    if (query.endDate && !this.isValidDate(query.endDate)) {
      throw AsksynkError.badRequest("Invalid endDate");
    }
    if (query.orderBy && !includes(["start", "createdAt"], query.orderBy)) {
      throw AsksynkError.badRequest("Invalid orderBy value");
    }
    if (
      query.orderDirection &&
      !includes(["asc", "desc"], query.orderDirection)
    ) {
      throw AsksynkError.badRequest("Invalid orderDirection value");
    }
    if (query.limit !== undefined) {
      const limitNum = toNumber(query.limit);
      if (!Number.isFinite(limitNum) || limitNum < 0) {
        throw AsksynkError.badRequest("Limit must be non-negative number");
      }
    }

    if (query.offset !== undefined) {
      const offsetNum = toNumber(query.offset);
      if (!Number.isFinite(offsetNum) || offsetNum < 0) {
        throw AsksynkError.badRequest("Offset must be non-negative number");
      }
    }
  }

  private validateRecurrenceType(type: string): void {
    if (!includes(VALID_RECURRENCE_TYPES, type as RecurrenceType)) {
      throw AsksynkError.badRequest("Invalid recurrence type");
    }
  }

  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }
}
