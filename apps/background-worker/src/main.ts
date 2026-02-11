import "dotenv/config";
import "reflect-metadata";

import { AppModule } from "@/worker/modules/app.module";
import { NestFactory } from "@nestjs/core";

async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule);
}

bootstrap();
