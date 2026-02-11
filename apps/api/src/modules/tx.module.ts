import { DB_CLIENT_PROVIDER, DbModule } from "./db.module";
import { Global, Module } from "@nestjs/common";

import { ClsModule } from "nestjs-cls";
import { ClsPluginTransactional } from "@nestjs-cls/transactional";
import { DB } from "@/api/db/db";
import { TransactionalAdapterDrizzleOrm } from "@nestjs-cls/transactional-adapter-drizzle-orm";

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
