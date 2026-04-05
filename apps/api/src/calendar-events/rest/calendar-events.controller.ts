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
import { toCalendarResponseDto } from "@/api/calendar-events/rest/calendar.mapper";
import { toCalendarEventResponseDto } from "@/api/calendar-events/rest/calendar-event.mapper";
import { toCalendarEventInstanceResponseDto } from "@/api/calendar-events/rest/calendar-event-instance.mapper";
import { AddCalendarEventExceptionRequestDto } from "@/api/calendar-events/rest/dto/add-calendar-event-exception.dto";
import { CreateCalendarEventRequestDto } from "@/api/calendar-events/rest/dto/create-calendar-event.dto";
import { ListCalendarEventsQueryDto } from "@/api/calendar-events/rest/dto/list-calendar-events-query.dto";
import { SplitCalendarEventSeriesRequestDto } from "@/api/calendar-events/rest/dto/split-calendar-event-series.dto";
import { UpdateCalendarEventRequestDto } from "@/api/calendar-events/rest/dto/update-calendar-event.dto";
import { UpdateCalendarEventInstanceRequestDto } from "@/api/calendar-events/rest/dto/update-calendar-event-instance.dto";
import { CalendarResponseDto } from "@/api/calendar-events/rest/responses/calendar.response";
import { CalendarEventResponseDto } from "@/api/calendar-events/rest/responses/calendar-event.response";
import { CalendarEventInstanceResponseDto } from "@/api/calendar-events/rest/responses/calendar-event-instance.response";
import { CalendarEventsService } from "@/api/calendar-events/services/calendar-events.service";
import { parseIsoWallClockInTimezone } from "@/api/calendar-events/utils/recurrence.utils";
import { UuidV7Param } from "@/api/common/decorators/id.decorators";

@Controller()
export class CalendarEventsController {
  constructor(private readonly calendarEventsService: CalendarEventsService) {}

  @Post("calendars")
  async ensureCalendar(
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarResponseDto> {
    const calendar = await this.calendarEventsService.ensureCalendar(user.id);
    return toCalendarResponseDto(calendar);
  }

  @Get("calendars")
  async getCalendar(
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarResponseDto | null> {
    const calendar = await this.calendarEventsService.getCalendar(user.id);
    return toCalendarResponseDto(calendar);
  }

  @Post("calendar-events")
  async createCalendarEvent(
    @Body() dto: CreateCalendarEventRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarEventResponseDto> {
    const event = await this.calendarEventsService.createCalendarEvent(
      user.id,
      {
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
      },
    );
    return toCalendarEventResponseDto(event);
  }

  @Get("calendar-events")
  async listCalendarEvents(
    @Query() query: ListCalendarEventsQueryDto,
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarEventInstanceResponseDto[]> {
    const instances = await this.calendarEventsService.listCalendarEvents(
      user.id,
      {
        windowStart: parseIsoWallClockInTimezone(query.start, query.timezone),
        windowEnd: parseIsoWallClockInTimezone(query.end, query.timezone),
        tagIds: query.tagIds,
      },
    );
    return instances.map(toCalendarEventInstanceResponseDto);
  }

  @Get("calendar-events/:id")
  async getCalendarEvent(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarEventResponseDto> {
    const event = await this.calendarEventsService.getCalendarEvent(
      user.id,
      id,
    );
    return toCalendarEventResponseDto(event);
  }

  @Put("calendar-events/:id")
  async updateCalendarEvent(
    @UuidV7Param("id") id: string,
    @Body() dto: UpdateCalendarEventRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarEventResponseDto> {
    const event = await this.calendarEventsService.updateCalendarEvent(
      user.id,
      {
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
      },
    );
    return toCalendarEventResponseDto(event);
  }

  @Delete("calendar-events/:id")
  @HttpCode(204)
  async deleteCalendarEvent(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.calendarEventsService.deleteCalendarEvent(user.id, id);
  }

  @Post("calendar-events/:id/exceptions")
  @HttpCode(204)
  async addException(
    @UuidV7Param("id") id: string,
    @Body() dto: AddCalendarEventExceptionRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.calendarEventsService.addException(
      user.id,
      id,
      dto.occurrenceStart,
    );
  }

  @Put("calendar-events/:id/instances/:start")
  async updateCalendarEventInstance(
    @UuidV7Param("id") id: string,
    @Param("start") start: string,
    @Body() dto: UpdateCalendarEventInstanceRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarEventResponseDto> {
    const event = await this.calendarEventsService.detachInstance(
      user.id,
      id,
      start,
      {
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
      },
    );
    return toCalendarEventResponseDto(event);
  }

  @Put("calendar-events/:id/split/:start")
  async splitSeries(
    @UuidV7Param("id") id: string,
    @Param("start") start: string,
    @Body() dto: SplitCalendarEventSeriesRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarEventResponseDto> {
    const event = await this.calendarEventsService.splitSeries(
      user.id,
      id,
      start,
      {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        link: dto.link,
        durationSeconds: dto.durationSeconds,
        timezone: dto.timezone,
        rrule: dto.rrule,
        color: dto.color,
        tagIds: dto.tagIds,
      },
    );
    return toCalendarEventResponseDto(event);
  }
}
