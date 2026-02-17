import "dotenv/config";
import "reflect-metadata";

import { AppModule } from "./modules/app.module";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { getCorsOptions } from "./config/cors.config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.enableCors(getCorsOptions(config));
  await app.listen(3000);
}

bootstrap();
