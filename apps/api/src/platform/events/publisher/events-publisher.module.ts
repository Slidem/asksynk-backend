import { Module } from "@nestjs/common";

import {
  EventsPublisher,
  EventsPublisherImpl,
} from "@/api/platform/events/publisher/events-publisher";

@Module({
  imports: [],
  providers: [{ provide: EventsPublisher, useClass: EventsPublisherImpl }],
  exports: [EventsPublisher],
})
export class EventsPublisherModule {}
