import {
  DynamicModule,
  FactoryProvider,
  Module,
  ModuleMetadata,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DiscoveryModule } from "@nestjs/core";

import { DurableConsumerRuntime } from "@/api/platform/events/consumer/durable-consumer-runtime.service";
import { EventConsumerDiscovery } from "@/api/platform/events/consumer/event-consumer.discovery";
import {
  EVENTS_CONSUMER_DB,
  EventsConsumerDb,
  RealtimeListenerService,
} from "@/api/platform/events/consumer/realtime-listener.service";
import { MessageBusModule } from "@/api/platform/jobs/message-bus/message-bus.module";

export interface EventConsumerAsyncOptions
  extends
    Pick<ModuleMetadata, "imports">,
    Pick<FactoryProvider<EventsConsumerDb>, "useFactory" | "inject"> {}

@Module({})
export class EventConsumerModule {
  static forRootAsync(opts: EventConsumerAsyncOptions): DynamicModule {
    return {
      module: EventConsumerModule,
      imports: [
        DiscoveryModule,
        ConfigModule,
        MessageBusModule,
        ...(opts.imports ?? []),
      ],
      providers: [
        {
          provide: EVENTS_CONSUMER_DB,
          inject: opts.inject ?? [],
          useFactory: opts.useFactory,
        },
        RealtimeListenerService,
        DurableConsumerRuntime,
        EventConsumerDiscovery,
      ],
      exports: [],
    };
  }
}
