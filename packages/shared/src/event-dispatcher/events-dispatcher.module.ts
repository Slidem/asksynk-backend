import {
  DynamicModule,
  FactoryProvider,
  Module,
  ModuleMetadata,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { MessageBusModule } from "../message-bus/message-bus.module";
import {
  EVENTS_DISPATCHER_DB,
  EventsDispatcherDb,
  EventsOutboxDispatcher,
} from "./events-dispatcher";

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
