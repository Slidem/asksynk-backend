import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { getDbInstance } from "@/api/infrastructure/db/db";

export const DB_CLIENT_PROVIDER = "DB";

@Global()
@Module({
  providers: [
    {
      provide: DB_CLIENT_PROVIDER,
      useFactory: (config: ConfigService) => getDbInstance(config),
      inject: [ConfigService],
    },
  ],
  exports: [DB_CLIENT_PROVIDER],
})
export class DbModule {}
