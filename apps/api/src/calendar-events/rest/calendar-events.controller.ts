import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
} from "@nestjs/common";

import { AllowGuest } from "@/api/auth/allowGuest.decorator";
import {
  AuthUser as AuthUserType,
  RequestActor as RequestActorType,
} from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { RequestActor } from "@/api/auth/requestActor.decorator";
import { toCalendarResponseDto } from "@/api/calendar-events/rest/calendar.mapper";
import { AddCalendarEventExceptionRequestDto } from "@/api/calendar-events/rest/dto/add-calendar-event-exception.dto";
import { CreateCalendarEventRequestDto } from "@/api/calendar-events/rest/dto/create-calendar-event.dto";
import { ListCalendarEventsQueryDto } from "@/api/calendar-events/rest/dto/list-calendar-events-query.dto";
import { SplitCalendarEventSeriesRequestDto } from "@/api/calendar-events/rest/dto/split-calendar-event-series.dto";
import { UpdateCalendarEventRequestDto } from "@/api/calendar-events/rest/dto/update-calendar-event.dto";
import { UpdateCalendarEventInstanceRequestDto } from "@/api/calendar-events/rest/dto/update-calendar-event-instance.dto";
import { CalendarResponseDto } from "@/api/calendar-events/rest/responses/calendar.response";
import { CalendarEventsService } from "@/api/calendar-events/services/calendar-events.service";
import { parseIsoWallClockInTimezone } from "@/api/calendar-events/utils/recurrence.utils";
import {
  IsoDateWithOffsetParam,
  UuidV7Param,
} from "@/api/common/decorators/param.decorators";
import { NetworksService } from "@/api/networks/services/networks.service";

import { toCalendarEventInstance } from "../mappers/calendar-event-instance.mapper";
import { CalendarEventInstance } from "../models/calendar-event-instance.model";

@Controller()
export class CalendarEventsController {
  constructor(
    private readonly calendarEventsService: CalendarEventsService,
    private readonly networksService: NetworksService,
  ) {}

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
  ): Promise<CalendarEventInstance> {
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
    return toCalendarEventInstance(event);
  }

  @AllowGuest()
  @Get("calendar-events")
  async listCalendarEvents(
    @Query() query: ListCalendarEventsQueryDto,
    @RequestActor() actor: RequestActorType,
  ): Promise<CalendarEventInstance[]> {
    const targetUserId = await this.networksService.resolveTargetUserId(
      actor,
      query.userId,
    );

    return await this.calendarEventsService.listCalendarEvents(targetUserId, {
      windowStart: parseIsoWallClockInTimezone(query.start, query.timezone),
      windowEnd: parseIsoWallClockInTimezone(query.end, query.timezone),
      tagIds: query.tagIds,
    });
  }

  @Get("calendar-events/:id")
  async getCalendarEvent(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarEventInstance> {
    const event = await this.calendarEventsService.getCalendarEvent(
      user.id,
      id,
    );
    return toCalendarEventInstance(event);
  }

  @Put("calendar-events/:id")
  async updateCalendarEvent(
    @UuidV7Param("id") id: string,
    @Body() dto: UpdateCalendarEventRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarEventInstance> {
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
    return toCalendarEventInstance(event);
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
    @IsoDateWithOffsetParam("start") start: string,
    @Body() dto: UpdateCalendarEventInstanceRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarEventInstance> {
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
    return toCalendarEventInstance(event);
  }

  @Put("calendar-events/:id/split/:start")
  async splitSeries(
    @UuidV7Param("id") id: string,
    @IsoDateWithOffsetParam("start") start: string,
    @Body() dto: SplitCalendarEventSeriesRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarEventInstance> {
    const event = await this.calendarEventsService.splitSeries(
      user.id,
      id,
      start,
      {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        link: dto.link,
        start: dto.start,
        durationSeconds: dto.durationSeconds,
        timezone: dto.timezone,
        rrule: dto.rrule,
        color: dto.color,
        tagIds: dto.tagIds,
      },
    );
    return toCalendarEventInstance(event);
  }
}
