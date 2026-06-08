import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { eq } from "drizzle-orm";
import { ContextLogger } from "nestjs-context-logger";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { UserProfile } from "@/api/user-profile/entities/user-profile.entity";
import { users } from "@/migrations/schema/users";

type UserRow = typeof users.$inferSelect;

@Injectable()
export class UserProfileRepository {
  private readonly logger = new ContextLogger(UserProfileRepository.name);

  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async getById(userId: string): Promise<UserProfile | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(users)
      .where(eq(users.id, userId));

    return row ? this.mapRow(row) : null;
  }

  async update(profile: UserProfile): Promise<UserProfile> {
    this.logger.info("Updating user profile", { userId: profile.id });

    const [updated] = await this.txHost.tx
      .update(users)
      .set({
        phone: profile.phone,
        avatarAttachmentId: profile.avatarAttachmentId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, profile.id))
      .returning();

    return this.mapRow(updated);
  }

  private mapRow(row: UserRow): UserProfile {
    return UserProfile.create({
      id: row.id,
      name: row.name,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      image: row.image,
      phone: row.phone,
      avatarAttachmentId: row.avatarAttachmentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
