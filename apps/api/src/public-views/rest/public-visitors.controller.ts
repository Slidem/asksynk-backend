import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";

import { AllowGuest } from "@/api/auth/allowGuest.decorator";
import { AuthGuest as AuthGuestType } from "@/api/auth/auth.types";
import { AuthGuest } from "@/api/auth/authGuest.decorator";
import { Public } from "@/api/auth/public.decorator";
import { CalendarEventInstance } from "@/api/calendar-events/models/calendar-event-instance.model";
import { ListCalendarEventsQueryDto } from "@/api/calendar-events/rest/dto/list-calendar-events-query.dto";
import { CalendarEventsService } from "@/api/calendar-events/services/calendar-events.service";
import { parseIsoWallClockInTimezone } from "@/api/calendar-events/utils/recurrence.utils";
import { GuestSignInRequestDto } from "@/api/public-views/rest/dto/guest-sign-in.dto";
import { toPublicViewMetadataResponseDto } from "@/api/public-views/rest/public-views.mapper";
import {
  GuestSessionResponseDto,
  GuestSignInResponseDto,
} from "@/api/public-views/rest/responses/guest.response";
import { PublicViewMetadataResponseDto } from "@/api/public-views/rest/responses/public-view.response";
import { GuestSessionsService } from "@/api/public-views/services/guest-sessions.service";

@Controller("public")
export class PublicVisitorsController {
  constructor(
    private readonly guestSessionsService: GuestSessionsService,
    private readonly calendarEventsService: CalendarEventsService,
  ) {}

  @Public()
  @Get("views/:slug")
  async getViewMetadata(
    @Param("slug") slug: string,
  ): Promise<PublicViewMetadataResponseDto> {
    const view = await this.guestSessionsService.getViewMetadataBySlug(slug);
    return toPublicViewMetadataResponseDto(view);
  }

  @Public()
  @Post("views/:slug/sign-in")
  async signIn(
    @Param("slug") slug: string,
    @Body() dto: GuestSignInRequestDto,
  ): Promise<GuestSignInResponseDto> {
    const { guest } = await this.guestSessionsService.signIn({
      slug,
      displayName: dto.displayName,
    });
    return {
      guestId: guest.id,
      token: guest.token,
      expiresAt: guest.expiresAt.toISOString(),
      publicViewId: guest.publicViewId,
    };
  }

  @AllowGuest()
  @Get("me")
  async me(
    @AuthGuest() guest: AuthGuestType,
  ): Promise<GuestSessionResponseDto> {
    return {
      guestId: guest.id,
      displayName: guest.displayName,
      publicViewId: guest.publicViewId,
      expiresAt: guest.expiresAt.toISOString(),
    };
  }

  @AllowGuest()
  @Get("calendar-events")
  async listCalendarEvents(
    @Query() query: ListCalendarEventsQueryDto,
    @AuthGuest() guest: AuthGuestType,
  ): Promise<CalendarEventInstance[]> {
    return this.calendarEventsService.listCalendarEvents(guest.ownerUserId, {
      windowStart: parseIsoWallClockInTimezone(query.start, query.timezone),
      windowEnd: parseIsoWallClockInTimezone(query.end, query.timezone),
      tagIds: query.tagIds,
    });
  }
}
