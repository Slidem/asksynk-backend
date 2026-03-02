import { ConfigModule } from "@nestjs/config";
import { Module } from "@nestjs/common";
import { NatsService } from "@/api/common/nats/nats.service";

@Module({
  imports: [ConfigModule],
  providers: [NatsService],
  exports: [NatsService],
})
export class NatsModule {}
