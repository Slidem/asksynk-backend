import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { eq, sql } from "drizzle-orm";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { users } from "@/migrations/schema/users";

export type UserLookupRow = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
};

@Injectable()
export class UsersLookupRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

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
