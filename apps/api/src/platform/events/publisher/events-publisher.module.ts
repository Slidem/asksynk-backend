import { Module } from "@nestjs/common";

import { EventsPublisher, EventsPublisherImpl } from "./events-publisher";

@Module({
  imports: [],
  providers: [{ provide: EventsPublisher, useClass: EventsPublisherImpl }],
  exports: [EventsPublisher],
})
export class EventsPublisherModule {}
