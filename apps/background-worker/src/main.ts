import "dotenv/config";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "@/worker/modules/app.module";

async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule);
}

bootstrap();
