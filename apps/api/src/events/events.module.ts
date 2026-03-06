import { EventsController } from "@/api/events/events.controller";
import { EventsRepository } from "@/api/events/events.repository";
import { EventsService } from "@/api/events/events.service";
import { Module } from "@nestjs/common";
import { NatsModule } from "@/api/common/nats/nats.module";
import { TagRepository } from "@/api/tags/tags.repository";

@Module({
  imports: [NatsModule],
  providers: [EventsRepository, EventsService, TagRepository],
  controllers: [EventsController],
  exports: [EventsService],
})
export class EventsModule {}
