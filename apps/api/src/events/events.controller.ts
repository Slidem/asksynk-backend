import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { UlidParam } from "@/api/common/decorators/id.decorators";
import { AsksynkError } from "@/api/common/errors/errors.model";
import {
  CreateEventRequestDto,
  EventResponseDto,
  ListEventsQueryDto,
  UpdateEventRequestDto,
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
import { ContextLogger } from "nestjs-context-logger";

@Controller("events")
export class EventsController {
  private readonly logger = new ContextLogger(EventsController.name);

  constructor(private readonly eventsService: EventsService) {}

  @Post()
  async createEvent(
    @Body() dto: CreateEventRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto> {
    this.logger.info("Received request to create event", {
      dto,
      userId: user.id,
    });

    throw AsksynkError.internalServerError(
      "Event creation is not implemented yet",
    );
  }

  @Get()
  async listEvents(
    @Query() query: ListEventsQueryDto,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto[]> {
    this.logger.info("Received request to list events", {
      query,
      userId: user.id,
    });

    throw AsksynkError.internalServerError(
      "Event listing is not implemented yet",
    );
  }

  @Get(":id")
  async getEvent(
    @UlidParam("id") eventId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto> {
    this.logger.info("Received request to get event by id", {
      eventId,
      userId: user.id,
    });

    throw AsksynkError.internalServerError(
      "Get event by id is not implemented yet",
    );
  }

  @Patch(":id")
  async updateEvent(
    @UlidParam("id") eventId: string,
    @Body() dto: UpdateEventRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto> {
    this.logger.info("Received request to update event by id", {
      eventId,
      dto,
      userId: user.id,
    });

    throw AsksynkError.internalServerError(
      "Event update is not implemented yet",
    );
  }

  @Delete(":id")
  async deleteEvent(
    @UlidParam("id") eventId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<EventResponseDto> {
    this.logger.info("Received request to delete event by id", {
      eventId,
      userId: user.id,
    });

    throw AsksynkError.internalServerError(
      "Event deletion is not implemented yet",
    );
  }

  @Delete(":id/recurrences")
  async deleteEventRecurrences(
    @UlidParam("id") eventId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<{ success: boolean }> {
    this.logger.info("Received request to delete event recurrences by id", {
      eventId,
      userId: user.id,
    });

    throw AsksynkError.internalServerError(
      "Delete event recurrences is not implemented yet",
    );
  }
}
