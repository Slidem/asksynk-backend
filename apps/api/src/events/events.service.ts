import { ContextLogger } from "nestjs-context-logger";
import { EventsRepository } from "@/api/events/events.repository";
import { Injectable } from "@nestjs/common";
import { TagRepository } from "@/api/tags/tags.repository";

@Injectable()
export class EventsService {
  private readonly logger = new ContextLogger(EventsService.name);

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly tagRepository: TagRepository,
  ) {}

  async createEvent() {}
}
