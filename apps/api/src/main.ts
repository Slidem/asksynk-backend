import "dotenv/config";
import "reflect-metadata";

import { AppModule } from "./modules/app.module";
import { NestFactory } from "@nestjs/core";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  if (process.env.NODE_ENV !== "production") {
    app.enableCors();
  }
  await app.listen(3000);
}

bootstrap();
