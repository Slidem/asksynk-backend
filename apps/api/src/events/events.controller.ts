import { Body, Controller, Post } from "@nestjs/common";

import { EventsService } from "@/api/events/events.service";
import { ContextLogger } from "nestjs-context-logger";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { AuthUser as AuthUserType } from "@/api/auth/auth.types";

interface CreateEventRequestDto {
  name: string;
  description: string;
  startTimeMillis: number;
  endTimeMillis: number;
  timeZoneIana: string;
  rrule: string;
  tagIds: string[];
}

@Controller("events")
export class EventsController {
  private readonly logger = new ContextLogger(EventsController.name);

  constructor(private readonly eventsService: EventsService) {}

  @Post()
  async createEvent(
    @Body() createEvent: CreateEventRequestDto,
    @AuthUser() user: AuthUserType,
  ) {
    this.logger.info("Creating event", createEvent);
    this.logger.debug("Creating event - user", { userId: user.id });
  }
}
