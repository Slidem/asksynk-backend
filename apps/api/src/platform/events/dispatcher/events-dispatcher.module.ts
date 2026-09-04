import {
  DynamicModule,
  FactoryProvider,
  Module,
  ModuleMetadata,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import {
  EVENTS_DISPATCHER_DB,
  EventsDispatcherDb,
  EventsOutboxDispatcher,
} from "@/api/platform/events/dispatcher/events-dispatcher";
import { MessageBusModule } from "@/api/platform/jobs/message-bus/message-bus.module";

export interface EventsDispatcherAsyncOptions
  extends
    Pick<ModuleMetadata, "imports">,
    Pick<FactoryProvider<EventsDispatcherDb>, "useFactory" | "inject"> {}

@Module({})
export class EventsDispatcherModule {
  static forRootAsync(opts: EventsDispatcherAsyncOptions): DynamicModule {
    return {
      module: EventsDispatcherModule,
      imports: [ConfigModule, MessageBusModule, ...(opts.imports ?? [])],
      providers: [
        {
          provide: EVENTS_DISPATCHER_DB,
          inject: opts.inject ?? [],
          useFactory: opts.useFactory,
        },
        EventsOutboxDispatcher,
      ],
      exports: [EventsOutboxDispatcher],
    };
  }
}
