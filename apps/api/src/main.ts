import "dotenv/config";
import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { IoAdapter } from "@nestjs/platform-socket.io";

import { AppModule } from "@/api/app.module";
import { getCorsOptions } from "@/api/platform/config/cors.config";
import { setupSwagger } from "@/api/platform/config/swagger.config";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Express 5 defaults to the "simple" parser; keep `a[]=x` / `a[b]=x` parsing.
  app.set("query parser", "extended");
  const config = app.get(ConfigService);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors(getCorsOptions(config));
  setupSwagger(app, config);
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.listen(3000);
}

bootstrap();
