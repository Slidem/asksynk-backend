import { ConfigModule, ConfigService } from "@nestjs/config";
import { ContextLogger, ContextLoggerModule } from "nestjs-context-logger";
import { ExecutionContext, Module } from "@nestjs/common";

@Module({
  imports: [
    ContextLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProd = configService.get<string>("ENVIRONMENT") === "prod";

        const serializers = { req: () => undefined };

        const prettyTransport = {
          target: "pino-pretty",
        };

        return {
          ignoreBootstrapLogs: isProd,
          enrichContext: (context: ExecutionContext) => {
            const request = context.switchToHttp?.().getRequest?.();

            const requestCorrelationId = request?.headers?.[
              "x-correlation-id"
            ] as string | undefined;

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
