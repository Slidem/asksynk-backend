import { Global, Module } from "@nestjs/common";

import { RealtimeBroadcaster } from "@/api/platform/realtime/realtime-broadcaster";

class NoopRealtimeBroadcaster extends RealtimeBroadcaster {
  emit(): void {}
}

/** Stands in for the global WebsocketsModule in suites that don't boot the gateway. */
@Global()
@Module({
  providers: [
    { provide: RealtimeBroadcaster, useClass: NoopRealtimeBroadcaster },
  ],
  exports: [RealtimeBroadcaster],
})
export class NoopRealtimeModule {}
