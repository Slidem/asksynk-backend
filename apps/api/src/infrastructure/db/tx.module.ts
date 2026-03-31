import { Global, Module } from "@nestjs/common";
import { ClsPluginTransactional } from "@nestjs-cls/transactional";
import { TransactionalAdapterDrizzleOrm } from "@nestjs-cls/transactional-adapter-drizzle-orm";
import { ClsModule } from "nestjs-cls";

import { DB } from "@/api/infrastructure/db/db";

import { DB_CLIENT_PROVIDER, DbModule } from "./db.module";

export type TxAdapter = TransactionalAdapterDrizzleOrm<DB>;

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      plugins: [
        new ClsPluginTransactional({
          imports: [DbModule],
          adapter: new TransactionalAdapterDrizzleOrm({
            drizzleInstanceToken: DB_CLIENT_PROVIDER,
          }),
        }),
      ],
    }),
  ],
})
export class TxModule {}
