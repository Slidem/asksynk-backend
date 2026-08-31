import { Module } from "@nestjs/common";

import { AuthModule } from "@/api/auth/auth.module";
import { MessagingModule } from "@/api/messaging/messaging.module";
import { WsAuthService } from "@/api/websockets/services/ws-auth.service";
import { WsGateway } from "@/api/websockets/ws.gateway";

@Module({
  imports: [AuthModule, MessagingModule],
  providers: [WsAuthService, WsGateway],
  exports: [],
})
export class WebsocketsModule {}
