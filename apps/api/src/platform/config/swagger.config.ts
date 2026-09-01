import type { INestApplication } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";

export function setupSwagger(
  app: INestApplication,
  config: ConfigService,
): void {
  const swaggerConfig = new DocumentBuilder()
    .setTitle("AskSynk API")
    .setDescription(
      "AskSynk backend REST API. Authenticated endpoints expect a better-auth " +
        "bearer token in the Authorization header.",
    )
    .setVersion("0.1.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "bearer",
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Docs routes are registered straight on Express and bypass the global Nest
  // auth guard, so gate them behind Basic-auth in production.
  if (config.get("ENVIRONMENT") === "production") {
    const user = config.get("SWAGGER_USER");
    const pass = config.get("SWAGGER_PASSWORD");
    app.use(
      ["/docs", "/docs-json"],
      (req: Request, res: Response, next: NextFunction) => {
        const [scheme, b64] = (req.headers.authorization ?? "").split(" ");
        const [u, p] = Buffer.from(b64 ?? "", "base64")
          .toString()
          .split(":");
        if (scheme === "Basic" && u === user && p === pass) return next();
        res
          .set("WWW-Authenticate", 'Basic realm="docs"')
          .status(401)
          .send("Authentication required");
      },
    );
  }

  SwaggerModule.setup("docs", app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
