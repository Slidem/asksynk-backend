import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";

import { AnswerModeType } from "@/api/tags/tags.model";
import { ContextLogger } from "nestjs-context-logger";
import { Injectable } from "@nestjs/common";
import { Tag } from "@/api/tags/tag.entity";
import { TransactionHost } from "@nestjs-cls/transactional";
import { TxAdapter } from "@/api/common/db/tx.module";
import { tags } from "@/migrations/schema/tags";

type TagRow = typeof tags.$inferSelect;

type CreateTag = Omit<TagRow, "id" | "createdAt" | "updatedAt">;

type UpdateTag = Partial<CreateTag>;

@Injectable()
export class TagRepository {
  private readonly logger = new ContextLogger(TagRepository.name);

  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async createTag(createTag: CreateTag): Promise<Tag> {
    this.logger.info("Creating tag", { createTag });

    const [createdTag] = await this.txHost.tx
      .insert(tags)
      .values(createTag)
      .returning();

    return this.mapDbRowToTag(createdTag);
  }

  async updateTagById(tagId: string, updateTag: UpdateTag): Promise<Tag> {
    this.logger.info("Updating tag by id", { tagId, updateTag });

    const [updatedTag] = await this.txHost.tx
      .update(tags)
      .set({
        ...updateTag,
        updatedAt: new Date(),
      })
      .where(eq(tags.id, Number(tagId)))
      .returning();

    return this.mapDbRowToTag(updatedTag);
  }

  async deleteTagById(tagId: string): Promise<Tag> {
    this.logger.info("Deleting tag by id", { tagId });

    const [deletedTag] = await this.txHost.tx
      .delete(tags)
      .where(eq(tags.id, Number(tagId)))
      .returning();

    return this.mapDbRowToTag(deletedTag);
  }

  async getTagById(tagId: string): Promise<Tag | null> {
    const tag = await this.txHost.tx
      .select()
      .from(tags)
      .where(eq(tags.id, Number(tagId)))
      .then((result) => result[0]);

    if (!tag) {
      return null;
    }

    return this.mapDbRowToTag(tag);
  }

  async listTagsByUserIdWithFilters(
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
      id: String(dbTag.id),
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
