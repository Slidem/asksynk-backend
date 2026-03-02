import { ConfigService } from "@nestjs/config";
import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

export const getCorsOptions = (config: ConfigService): CorsOptions => {
  const trustedOrigins = config
    .getOrThrow<string>("TRUSTED_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin: (origin, callback) => {
      if (!origin || trustedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  };
};
