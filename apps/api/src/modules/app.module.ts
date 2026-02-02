import { DummyController } from "@/api/routes/dummy.controller";
import { HealthController } from "@/api/routes/health.controller";
import { Module } from "@nestjs/common";

@Module({
  controllers: [HealthController, DummyController],
})
export class AppModule {}
