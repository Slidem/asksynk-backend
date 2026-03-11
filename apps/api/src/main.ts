import "dotenv/config";
import "reflect-metadata";

import { AppModule } from "@/api/app.module";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { getCorsOptions } from "@/api/common/config/cors.config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors(getCorsOptions(config));
  await app.listen(3000);
}

bootstrap();
