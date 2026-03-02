import {
  CreateTagInput,
  ListTagsInput,
  UpdateTagInput,
} from "@/api/tags/tags-request.dto";
import { Injectable, NotFoundException } from "@nestjs/common";

import { ContextLogger } from "nestjs-context-logger";
import { Tag } from "@/api/tags/tag.entity";
import { TagRepository } from "@/api/tags/tags.repository";
import { Transactional } from "@nestjs-cls/transactional";

@Injectable()
export class TagsService {
  private readonly logger = new ContextLogger(TagsService.name);
  constructor(private readonly tagsRepository: TagRepository) {}

  @Transactional()
  async createTag(createTag: CreateTagInput): Promise<Tag> {
    const defaults = Tag.defaults();

    const notificationsSettings = createTag.notificationsSettings
      ? {
          ...defaults.notificationsSettings,
          ...createTag.notificationsSettings,
        }
      : defaults.notificationsSettings;

    const createdTag = await this.tagsRepository.createTag({
      userId: createTag.userId,
      name: createTag.name,
      description: createTag.description,
      color: createTag.color ?? defaults.color,
      answerMode: createTag.answerMode ?? defaults.answerMode,
      responseTimeMillis:
        createTag.responseTimeMillis ?? defaults.responseTimeMillis,
      notificationsSettings,
    });

    return createdTag;
  }

  @Transactional()
  async listTags(userId: string, listTags: ListTagsInput): Promise<Tag[]> {
    this.logger.info("Listing tags", { userId, listTags });

    return this.tagsRepository.listTagsByUserIdWithFilters(userId, {
      answerMode: listTags.answerMode,
      orderBy: listTags.orderBy ?? "createdAt",
      orderDirection: listTags.orderDirection ?? "desc",
      search: listTags.search,
      limit: listTags.limit,
      offset: listTags.offset,
    });
  }

  @Transactional()
  async updateTag(updateTag: UpdateTagInput): Promise<Tag> {
    this.logger.info("Updating tag", {
      userId: updateTag.userId,
      tagId: updateTag.tagId,
    });

    const existing = await this.tagsRepository.getTagById(updateTag.tagId);
    if (!existing || !existing.belongsTo(updateTag.userId)) {
      throw new NotFoundException("Tag not found");
    }

    const updatePayload: Partial<{
      name: string;
      description?: string | null;
      color: string;
      answerMode: Tag["answerMode"];
      responseTimeMillis: number;
      notificationsSettings: Tag["notificationsSettings"];
    }> = {};

    if (updateTag.name !== undefined) {
      updatePayload.name = updateTag.name;
    }

    if (updateTag.description !== undefined) {
      updatePayload.description = updateTag.description;
    }

    if (updateTag.color !== undefined) {
      updatePayload.color = updateTag.color;
    }

    if (updateTag.answerMode !== undefined) {
      updatePayload.answerMode = updateTag.answerMode;
    }

    if (updateTag.responseTimeMillis !== undefined) {
      updatePayload.responseTimeMillis = updateTag.responseTimeMillis;
    }

    if (updateTag.notificationsSettings !== undefined) {
      updatePayload.notificationsSettings = updateTag.notificationsSettings;
    }

    const updatedTag = await this.tagsRepository.updateTagById(
      updateTag.tagId,
      updatePayload,
    );

    return updatedTag;
  }

  @Transactional()
  async deleteTag(userId: string, tagId: string): Promise<Tag> {
    this.logger.info("Deleting tag", { userId, tagId });

    const existing = await this.tagsRepository.getTagById(tagId);
    if (!existing || !existing.belongsTo(userId)) {
      throw new NotFoundException("Tag not found");
    }

    const deletedTag = await this.tagsRepository.deleteTagById(tagId);

    return deletedTag;
  }
}
