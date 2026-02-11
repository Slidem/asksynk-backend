import { ContextLogger } from "nestjs-context-logger";
import { Injectable } from "@nestjs/common";
import { TagDto } from "@/api/dtos/tagDto";
import { TransactionHost } from "@nestjs-cls/transactional";
import { TxAdapter } from "../modules/tx.module";
import { eq } from "drizzle-orm";
import { tags } from "@/migrations/schema/tags";

type TagRow = typeof tags.$inferSelect;

type TagInsert = typeof tags.$inferInsert;

type CreateTagInput = Omit<TagInsert, "id" | "createdAt" | "updatedAt">;

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

  async updateTag(tagId: string, updateTag: CreateTagInput): Promise<TagDto> {
    this.logger.info("Updating tag", { tagId, updateTag });

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

  async getTagByName(tagName: string): Promise<TagDto | null> {
    this.logger.info("Getting tag by name", { tagName });

    const tag = await this.txHost.tx
      .select()
      .from(tags)
      .where(eq(tags.name, tagName))
      .then((result) => result[0]);

    if (!tag) {
      return null;
    }

    return this.mapDbTagToTagDto(tag);
  }

  async listTagsByUserId(userId: string): Promise<TagDto[]> {
    this.logger.info("Querying tags by user id", { userId });

    const result = await this.txHost.tx
      .select()
      .from(tags)
      .where(eq(tags.userId, userId));

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
