import { ContextLogger } from "nestjs-context-logger";
import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { TxAdapter } from "@/api/common/db/tx.module";
import { eq } from "drizzle-orm";
import { users } from "@/migrations/schema/users";

type UserRow = typeof users.$inferSelect;

type UserInsert = typeof users.$inferInsert;

type CreateUserInput = Omit<UserInsert, "createdAt" | "updatedAt">;

type UpdateUserInput = Partial<
  Omit<UserInsert, "id" | "createdAt" | "updatedAt">
>;

@Injectable()
export class UsersRepository {
  private readonly logger = new ContextLogger(UsersRepository.name);

  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async getById(userId: string): Promise<UserRow | null> {
    this.logger.info("Getting user by id", { userId });

    const result = await this.txHost.tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .then((rows) => rows[0]);

    return result ?? null;
  }

  async createUser(input: CreateUserInput): Promise<UserRow> {
    this.logger.info("Creating user", { userId: input.id });

    const [created] = await this.txHost.tx
      .insert(users)
      .values({
        ...input,
      })
      .returning();

    return created;
  }

  async updateUser(userId: string, input: UpdateUserInput): Promise<UserRow> {
    this.logger.info("Updating user", { userId });

    const [updated] = await this.txHost.tx
      .update(users)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    return updated;
  }
}
