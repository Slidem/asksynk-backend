import { DB } from "@/api/db/db";
import { TagDto } from "@/api/dtos/tagDto";
import { tags } from "@/migrations/schema/tags";
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB_CLIENT_PROVIDER } from "../modules/db.module";

type TagRow = typeof tags.$inferSelect;

type TagInsert = typeof tags.$inferInsert;

type CreateTagInput = Omit<TagInsert, "id" | "createdAt" | "updatedAt">;

@Injectable()
export class TagRepository {
  constructor(@Inject(DB_CLIENT_PROVIDER) private readonly dbClient: DB) {}

  async createTag(createTag: CreateTagInput): Promise<TagDto> {
    const [createdTag] = await this.dbClient
      .insert(tags)
      .values({
        ...createTag,
      })
      .returning();

    return this.mapDbTagToTagDto(createdTag);
  }

  async listTagsByUserId(userId: string): Promise<TagDto[]> {
    const result = await this.dbClient
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
