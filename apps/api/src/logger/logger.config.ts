import { ConfigModule, ConfigService } from "@nestjs/config";
import { ContextLogger, ContextLoggerModule } from "nestjs-context-logger";

import { Module } from "@nestjs/common";

@Module({
  imports: [
    ContextLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProd = configService.get<string>("ENVIRONMENT") === "prod";

        // Exclude request body and query parameters from logs; already included with help of nestjs-context-logger
        const serializers = { req: () => undefined };

        // Use pretty transport in non-production environments for better readability during development
        const prettyTransport = {
          target: "pino-pretty",
        };

        return {
          ignoreBootstrapLogs: isProd,
          enrichContext: (context) => {
            const requestCorrelationId = context.switchToHttp().getRequest()
              .headers["x-correlation-id"] as string | undefined;

            const currentCorrelationId =
              requestCorrelationId || ContextLogger.getContext().correlationId;

            return { correlationId: currentCorrelationId };
          },
          pinoHttp: {
            level: "info",
            serializers: serializers,
            transport: isProd ? undefined : prettyTransport,
          },
        };
      },
    }),
  ],
})
export class LoggerConfigModule {}
