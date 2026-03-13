import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { UuidV7Param } from "@/api/common/decorators/id.decorators";
import {
  toCalendarResponseDto,
  toEventInstanceResponseDto,
  toEventResponseDto,
} from "@/api/events/events.mappers";
import {
  AddExceptionRequestDto,
  CalendarResponseDto,
  CreateEventRequestDto,
  EventInstanceResponseDto,
  EventResponseDto,
  ListEventsQueryDto,
  SplitSeriesRequestDto,
  UpdateEventRequestDto,
  UpdateInstanceRequestDto,
} from "@/api/events/events.rest-dto";
import { EventsService } from "@/api/events/events.service";
import { parseIsoToWallClock } from "@/api/events/recurrence.utils";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post("calendars")
  async ensureCalendar(
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarResponseDto> {
    const calendar = await this.eventsService.ensureCalendar(user.id);
    return toCalendarResponseDto(calendar);
  }

  @Get("calendars")
  async getCalendar(
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarResponseDto | null> {
    const calendar = await this.eventsService.getCalendar(user.id);
    return toCalendarResponseDto(calendar);
  }

  @Post("events")
  async createEvent(
    @Body() dto: CreateEventRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto> {
    const event = await this.eventsService.createEvent(user.id, {
      id: dto.id,
      title: dto.title,
      description: dto.description,
      location: dto.location,
      link: dto.link,
      start: parseIsoToWallClock(dto.start),
      durationSeconds: dto.durationSeconds,
      allDay: dto.allDay,
      timezone: dto.timezone,
      rrule: dto.rrule,
      color: dto.color,
      tagIds: dto.tagIds,
    });
    return toEventResponseDto(event);
  }

  @Get("events")
  async listEvents(
    @Query() query: ListEventsQueryDto,
    @AuthUser() user: AuthUserType,
  ): Promise<EventInstanceResponseDto[]> {
    const instances = await this.eventsService.listEvents(user.id, {
      windowStart: parseIsoToWallClock(query.start),
      windowEnd: parseIsoToWallClock(query.end),
    });
    return instances.map(toEventInstanceResponseDto);
  }

  @Get("events/:id")
  async getEvent(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto> {
    const event = await this.eventsService.getEvent(user.id, id);
    return toEventResponseDto(event);
  }

  @Put("events/:id")
  async updateEvent(
    @UuidV7Param("id") id: string,
    @Body() dto: UpdateEventRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto> {
    const event = await this.eventsService.updateEvent(user.id, {
      eventId: id,
      title: dto.title,
      description: dto.description,
      location: dto.location,
      link: dto.link,
      // TODO: double check ?? are we sure we want this behavior ?
      // wall clock stripping the timezone is wrong; what we would want
      // is actually convert and save to UTC timestamp, but also store timezone
      // for later expanding rrule
      // regardless what iso with timestamp we get , we always consider the timezone provided in the request as the source of truth, and convert the start to utc
      start: dto.start ? parseIsoToWallClock(dto.start) : undefined,
      durationSeconds: dto.durationSeconds,
      allDay: dto.allDay,
      timezone: dto.timezone,
      rrule: dto.rrule,
      color: dto.color,
      tagIds: dto.tagIds,
    });
    return toEventResponseDto(event);
  }

  @Delete("events/:id")
  @HttpCode(204)
  async deleteEvent(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.eventsService.deleteEvent(user.id, id);
  }

  @Post("events/:id/exceptions")
  @HttpCode(204)
  async addException(
    @UuidV7Param("id") id: string,
    @Body() dto: AddExceptionRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.eventsService.addException(user.id, id, dto.occurrenceStart);
  }

  @Put("events/:id/instances/:start")
  async updateInstance(
    @UuidV7Param("id") id: string,
    @Param("start") start: string, // TODO: We need to create a custom type to "compact iso" in and directly serialize this here instead of passing strings
    @Body() dto: UpdateInstanceRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto> {
    const event = await this.eventsService.detachInstance(user.id, id, start, {
      title: dto.title,
      description: dto.description,
      location: dto.location,
      link: dto.link,
      start: dto.start ? parseIsoToWallClock(dto.start) : undefined,
      durationSeconds: dto.durationSeconds,
      timezone: dto.timezone,
      color: dto.color,
      tagIds: dto.tagIds,
    });
    return toEventResponseDto(event);
  }

  @Put("events/:id/split/:start")
  async splitSeries(
    @UuidV7Param("id") id: string,
    @Param("start") start: string,
    @Body() dto: SplitSeriesRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto> {
    const event = await this.eventsService.splitSeries(user.id, id, start, {
      title: dto.title,
      description: dto.description,
      location: dto.location,
      link: dto.link,
      durationSeconds: dto.durationSeconds,
      timezone: dto.timezone,
      rrule: dto.rrule,
      color: dto.color,
      tagIds: dto.tagIds,
    });
    return toEventResponseDto(event);
  }
}
