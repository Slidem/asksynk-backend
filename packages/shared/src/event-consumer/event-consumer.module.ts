import {
  DynamicModule,
  FactoryProvider,
  Module,
  ModuleMetadata,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DiscoveryModule } from "@nestjs/core";

import { MessageBusModule } from "../message-bus/message-bus.module";
import { DurableConsumerRuntime } from "./durable-consumer-runtime.service";
import { EventConsumerDiscovery } from "./event-consumer.discovery";
import {
  EVENTS_CONSUMER_DB,
  EventsConsumerDb,
  RealtimeListenerService,
} from "./realtime-listener.service";

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
