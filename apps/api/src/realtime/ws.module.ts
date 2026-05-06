import { Module } from "@nestjs/common";

import { AuthModule } from "@/api/auth/auth.module";
import { MessagingModule } from "@/api/messaging/messaging.module";
import { MessageCreatedBroadcastHandler } from "@/api/realtime/handlers/message-created.handler";
import { EventConsumerModule } from "@/shared/event-consumer/event-consumer.module";
import { MessageBusModule } from "@/shared/message-bus/message-bus.module";

import { WsAuthService } from "./services/ws-auth.service";
import { WsBroadcaster } from "./services/ws-broadcaster.service";
import { WsGateway } from "./ws.gateway";

@Module({
  imports: [AuthModule, MessageBusModule, EventConsumerModule, MessagingModule],
  providers: [
    WsAuthService,
    WsGateway,
    MessageCreatedBroadcastHandler,
    WsBroadcaster,
  ],
  exports: [],
})
export class RealtimeModule {}
