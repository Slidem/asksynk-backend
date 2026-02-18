import { ContextLogger } from "nestjs-context-logger";
import { Injectable } from "@nestjs/common";
import { TagDto } from "@/api/dtos/tagDto";
import { TransactionHost } from "@nestjs-cls/transactional";
import { TxAdapter } from "../modules/tx.module";
import { and, asc, desc, eq, ilike } from "drizzle-orm";
import { tags } from "@/migrations/schema/tags";

type TagRow = typeof tags.$inferSelect;

type TagInsert = typeof tags.$inferInsert;

type CreateTagInput = Omit<TagInsert, "id" | "createdAt" | "updatedAt">;

type UpdateTagInput = Partial<CreateTagInput>;

@Injectable()
export class TagRepository {
  private readonly logger = new ContextLogger(TagRepository.name);

  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async createTag(createTag: CreateTagInput): Promise<TagDto> {
    this.logger.info("Creating tag", { createTag });

    const [createdTag] = await this.txHost.tx
      .insert(tags)
      .values({
        ...createTag,
      })
      .returning();

    return this.mapDbTagToTagDto(createdTag);
  }

  async updateTagById(
    tagId: string,
    updateTag: UpdateTagInput,
  ): Promise<TagDto> {
    this.logger.info("Updating tag by id", { tagId, updateTag });

    const [updatedTag] = await this.txHost.tx
      .update(tags)
      .set({
        ...updateTag,
        updatedAt: new Date(),
      })
      .where(eq(tags.id, Number(tagId)))
      .returning();

    return this.mapDbTagToTagDto(updatedTag);
  }

  async deleteTagById(tagId: string): Promise<TagDto> {
    this.logger.info("Deleting tag by id", { tagId });

    const [deletedTag] = await this.txHost.tx
      .delete(tags)
      .where(eq(tags.id, Number(tagId)))
      .returning();

    return this.mapDbTagToTagDto(deletedTag);
  }

  async getTagById(tagId: string): Promise<TagDto | null> {
    this.logger.info("Getting tag by id", { tagId });

    const tag = await this.txHost.tx
      .select()
      .from(tags)
      .where(eq(tags.id, Number(tagId)))
      .then((result) => result[0]);

    if (!tag) {
      return null;
    }

    return this.mapDbTagToTagDto(tag);
  }

  async listTagsByUserIdWithFilters(
    userId: string,
    options: {
      answerMode?: TagRow["answerMode"];
      orderBy?: "createdAt" | "updatedAt";
      orderDirection?: "asc" | "desc";
      search?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<TagDto[]> {
    this.logger.info("Querying tags with filters", { userId, options });

    const filters = [eq(tags.userId, userId)];
    if (options.answerMode) {
      filters.push(eq(tags.answerMode, options.answerMode));
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

    return result.map((tag) => this.mapDbTagToTagDto(tag));
  }

  private mapDbTagToTagDto(dbTag: TagRow): TagDto {
    return {
      id: String(dbTag.id),
      name: dbTag.name,
      userId: dbTag.userId,
      description: dbTag.description ?? undefined,
      color: dbTag.color,
      answerMode: dbTag.answerMode,
      responseTimeMillis: dbTag.responseTimeMillis,
      notificationsSettings: {
        browserNotificationEnabled:
          dbTag.notificationsSettings.browserNotificationEnabled,
        soundNotificationEnabled:
          dbTag.notificationsSettings.soundNotificationEnabled,
      },
    };
  }
}
