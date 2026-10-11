import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { eq, sql } from "drizzle-orm";

import {
  UserLookupRow,
  UsersLookupRepository,
} from "@/api/network/domain/ports/users-lookup.repository";
import { TxAdapter } from "@/api/platform/db/tx.module";
import { users } from "@/migrations/schema/users";

@Injectable()
export class DrizzleUsersLookupRepository extends UsersLookupRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {
    super();
  }

  async getByEmail(email: string): Promise<UserLookupRow | null> {
    const [row] = await this.txHost.tx
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
      .limit(1);
    return row ?? null;
  }

  async getById(id: string): Promise<UserLookupRow | null> {
    const [row] = await this.txHost.tx
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ?? null;
  }
}
