import { Global, Module } from "@nestjs/common";

import { AuthModule } from "@/api/auth/auth.module";
import { RealtimeBroadcaster } from "@/api/platform/realtime/realtime-broadcaster";
import { WsGateway } from "@/api/websockets/ws.gateway";

// Global: contexts inject RealtimeBroadcaster without importing this module (→ AuthModule).
@Global()
@Module({
  imports: [AuthModule],
  providers: [
    WsGateway,
    { provide: RealtimeBroadcaster, useExisting: WsGateway },
  ],
  exports: [RealtimeBroadcaster],
})
export class WebsocketsModule {}
