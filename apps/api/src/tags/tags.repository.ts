import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";

import { AnswerModeType } from "@/api/tags/tags.model";
import { ContextLogger } from "nestjs-context-logger";
import { Injectable } from "@nestjs/common";
import { Tag } from "@/api/tags/tag.entity";
import { TransactionHost } from "@nestjs-cls/transactional";
import { TxAdapter } from "@/api/common/db/tx.module";
import { UUID } from "uuidv7";
import { tags } from "@/migrations/schema/tags";

type TagRow = typeof tags.$inferSelect;

@Injectable()
export class TagRepository {
  private readonly logger = new ContextLogger(TagRepository.name);

  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async add(tag: Tag): Promise<Tag> {
    this.logger.info("Adding tag", { tagId: tag.id });

    const [created] = await this.txHost.tx
      .insert(tags)
      .values({
        id: tag.id.toString(),
        userId: tag.userId,
        name: tag.name,
        description: tag.description,
        color: tag.color,
        answerMode: tag.answerMode,
        notificationsSettings: tag.notificationsSettings,
      })
      .returning();

    return this.mapDbRowToTag(created);
  }

  async update(tag: Tag): Promise<Tag> {
    this.logger.info("Updating tag", { tagId: tag.id });

    const [updated] = await this.txHost.tx
      .update(tags)
      .set({
        name: tag.name,
        description: tag.description,
        color: tag.color,
        answerMode: tag.answerMode,
        notificationsSettings: tag.notificationsSettings,
        updatedAt: new Date(),
      })
      .where(eq(tags.id, tag.id.toString()))
      .returning();

    return this.mapDbRowToTag(updated);
  }

  async delete(tagId: string): Promise<Tag> {
    this.logger.info("Deleting tag", { tagId });

    const [deleted] = await this.txHost.tx
      .delete(tags)
      .where(eq(tags.id, tagId))
      .returning();

    return this.mapDbRowToTag(deleted);
  }

  async getById(id: string): Promise<Tag | null> {
    const tag = await this.txHost.tx
      .select()
      .from(tags)
      .where(eq(tags.id, id))
      .then((result) => result[0]);

    if (!tag) {
      return null;
    }

    return this.mapDbRowToTag(tag);
  }

  async getByIds(ids: string[]): Promise<Tag[]> {
    if (ids.length === 0) {
      return [];
    }

    const tagsList = await this.txHost.tx
      .select()
      .from(tags)
      .where(inArray(tags.id, ids));

    return tagsList.map((tag) => this.mapDbRowToTag(tag));
  }

  async listByUserIdWithFilters(
    userId: string,
    options: {
      answerMode?: AnswerModeType;
      orderBy?: "createdAt" | "updatedAt";
      orderDirection?: "asc" | "desc";
      search?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<Tag[]> {
    const filters = [eq(tags.userId, userId)];

    if (options.answerMode) {
      filters.push(sql`${tags.answerMode}->>'type' = ${options.answerMode}`);
    }

    if (options.search) {
      filters.push(ilike(tags.name, `%${options.search}%`));
    }

    const orderColumn =
      options.orderBy === "updatedAt" ? tags.updatedAt : tags.createdAt;

    const orderFn = options.orderDirection === "asc" ? asc : desc;

    const query = this.txHost.tx
      .select()
      .from(tags)
      .where(and(...filters))
      .orderBy(orderFn(orderColumn));

    if (options.limit !== undefined) {
      query.limit(options.limit);
    }

    if (options.offset !== undefined) {
      query.offset(options.offset);
    }

    const result = await query;

    return result.map((tag) => this.mapDbRowToTag(tag));
  }

  private mapDbRowToTag(dbTag: TagRow): Tag {
    return Tag.create({
      id: UUID.parse(dbTag.id),
      name: dbTag.name,
      userId: dbTag.userId,
      description: dbTag.description ?? undefined,
      color: dbTag.color,
      answerMode: dbTag.answerMode,
      notificationsSettings: {
        browserNotificationEnabled:
          dbTag.notificationsSettings.browserNotificationEnabled,
        soundNotificationEnabled:
          dbTag.notificationsSettings.soundNotificationEnabled,
      },
      createdAt: dbTag.createdAt,
      updatedAt: dbTag.updatedAt,
    });
  }
}
