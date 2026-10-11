import { Module } from "@nestjs/common";

import { AuthModule } from "@/api/auth/auth.module";
import { ConversationsModule } from "@/api/conversations/conversations.module";
import { FilesModule } from "@/api/files/files.module";
import { WsAuthService } from "@/api/websockets/services/ws-auth.service";
import { WsGateway } from "@/api/websockets/ws.gateway";

@Module({
  imports: [AuthModule, ConversationsModule, FilesModule],
  providers: [WsAuthService, WsGateway],
  exports: [],
})
export class WebsocketsModule {}
