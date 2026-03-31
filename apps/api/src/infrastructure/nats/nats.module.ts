import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { NatsService } from "@/api/infrastructure/nats/nats.service";

@Module({
  imports: [ConfigModule],
  providers: [NatsService],
  exports: [NatsService],
})
export class NatsModule {}
