import { Module } from "@nestjs/common";

import { AuthModule } from "@/api/auth/auth.module";
import { DB_CLIENT_PROVIDER } from "@/api/infrastructure/db/db.module";
import { MessagingModule } from "@/api/messaging/messaging.module";
import { EventConsumerModule } from "@/shared/event-consumer/event-consumer.module";
import { EventsConsumerDb } from "@/shared/event-consumer/realtime-listener.service";
import { MessageBusModule } from "@/shared/message-bus/message-bus.module";

import { WsAuthService } from "./services/ws-auth.service";
import { WsGateway } from "./ws.gateway";

@Module({
  imports: [
    AuthModule,
    MessageBusModule,
    EventConsumerModule.forRootAsync({
      inject: [DB_CLIENT_PROVIDER],
      useFactory: (db: EventsConsumerDb) => db,
    }),
    MessagingModule,
  ],
  providers: [WsAuthService, WsGateway],
  exports: [],
})
export class RealtimeModule {}
