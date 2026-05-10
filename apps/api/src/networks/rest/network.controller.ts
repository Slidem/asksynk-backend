import { Controller, Delete, Get, HttpCode, Param, Query } from "@nestjs/common";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { CalendarEventInstance } from "@/api/calendar-events/models/calendar-event-instance.model";
import { ListCalendarEventsQueryDto } from "@/api/calendar-events/rest/dto/list-calendar-events-query.dto";
import { CalendarEventsService } from "@/api/calendar-events/services/calendar-events.service";
import { parseIsoWallClockInTimezone } from "@/api/calendar-events/utils/recurrence.utils";
import { AsksynkError } from "@/api/common/errors/errors.model";
import { toNetworkConnectionResponseDto } from "@/api/networks/rest/networks.mapper";
import { NetworkConnectionResponseDto } from "@/api/networks/rest/responses/network-connection.response";
import { NetworksService } from "@/api/networks/services/networks.service";

@Controller("network")
export class NetworkController {
  constructor(
    private readonly networksService: NetworksService,
    private readonly calendarEventsService: CalendarEventsService,
  ) {}

  @Get()
  async list(
    @AuthUser() user: AuthUserType,
  ): Promise<NetworkConnectionResponseDto[]> {
    const connections = await this.networksService.listConnections(user.id);
    return connections.map(toNetworkConnectionResponseDto);
  }

  @Delete(":connectionId")
  @HttpCode(204)
  async remove(
    @Param("connectionId") connectionId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.networksService.removeConnection(user.id, connectionId);
  }

  @Get(":connectionId/calendar-events")
  async listConnectionCalendarEvents(
    @Param("connectionId") connectionId: string,
    @Query() query: ListCalendarEventsQueryDto,
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarEventInstance[]> {
    if (connectionId === user.id) {
      throw AsksynkError.notFound("Network connection not found");
    }

    const connected = await this.networksService.isActiveConnection(
      user.id,
      connectionId,
    );
    if (!connected) {
      throw AsksynkError.notFound("Network connection not found");
    }

    return this.calendarEventsService.listCalendarEvents(connectionId, {
      windowStart: parseIsoWallClockInTimezone(query.start, query.timezone),
      windowEnd: parseIsoWallClockInTimezone(query.end, query.timezone),
      tagIds: query.tagIds,
    });
  }
}
