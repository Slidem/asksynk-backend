import { Module } from "@nestjs/common";

import { AuthModule } from "@/api/auth/auth.module";
import { MessagingModule } from "@/api/messaging/messaging.module";

import { WsAuthService } from "./services/ws-auth.service";
import { WsGateway } from "./ws.gateway";

@Module({
  imports: [AuthModule, MessagingModule],
  providers: [WsAuthService, WsGateway],
  exports: [],
})
export class WebsocketsModule {}
