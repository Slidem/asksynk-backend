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

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { UuidV7Param } from "@/api/common/decorators/id.decorators";
import { toCalendarResponseDto } from "@/api/events/rest/calendar.mapper";
import { AddExceptionRequestDto } from "@/api/events/rest/dto/add-exception.dto";
import { CreateEventRequestDto } from "@/api/events/rest/dto/create-event.dto";
import { ListEventsQueryDto } from "@/api/events/rest/dto/list-events-query.dto";
import { SplitSeriesRequestDto } from "@/api/events/rest/dto/split-series.dto";
import { UpdateEventRequestDto } from "@/api/events/rest/dto/update-event.dto";
import { UpdateInstanceRequestDto } from "@/api/events/rest/dto/update-instance.dto";
import { toEventResponseDto } from "@/api/events/rest/event.mapper";
import { toEventInstanceResponseDto } from "@/api/events/rest/event-instance.mapper";
import { CalendarResponseDto } from "@/api/events/rest/responses/calendar.response";
import { EventResponseDto } from "@/api/events/rest/responses/event.response";
import { EventInstanceResponseDto } from "@/api/events/rest/responses/event-instance.response";
import { EventsService } from "@/api/events/services/events.service";
import { parseIsoWallClockInTimezone } from "@/api/events/utils/recurrence.utils";

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
      start: parseIsoWallClockInTimezone(dto.start, dto.timezone),
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
      windowStart: parseIsoWallClockInTimezone(query.start, query.timezone),
      windowEnd: parseIsoWallClockInTimezone(query.end, query.timezone),
      tagIds: query.tagIds,
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
      start:
        dto.start && dto.timezone
          ? parseIsoWallClockInTimezone(dto.start, dto.timezone)
          : undefined,
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
    @Param("start") start: string,
    @Body() dto: UpdateInstanceRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto> {
    const event = await this.eventsService.detachInstance(user.id, id, start, {
      title: dto.title,
      description: dto.description,
      location: dto.location,
      link: dto.link,
      start:
        dto.start && dto.timezone
          ? parseIsoWallClockInTimezone(dto.start, dto.timezone)
          : undefined,
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
