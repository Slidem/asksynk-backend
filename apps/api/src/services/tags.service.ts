import {
  CreateTagInput,
  ListTagsInput,
  UpdateTagInput,
} from "@/api/dtos/tagRequestsDto";
import { Injectable, NotFoundException } from "@nestjs/common";

import { ContextLogger } from "nestjs-context-logger";
import { NatsService } from "@/api/services/nats.service";
import { TagDto } from "@/api/dtos/tagDto";
import { TagRepository } from "@/api/repository/tag.repository";
import { Transactional } from "@nestjs-cls/transactional";

@Injectable()
export class TagsService {
  private readonly DEFAULT_TAG_SETTINGS = {
    color: "#6b7280",
    answerMode: "immediately" as const,
    responseTimeMillis: 0,
    notificationsSettings: {
      browserNotificationEnabled: true,
      soundNotificationEnabled: true,
    },
  };

  private readonly logger = new ContextLogger(TagsService.name);

  constructor(
    private readonly tagsRepository: TagRepository,
    private readonly natsService: NatsService,
  ) {}

  @Transactional()
  async createTag(createTag: CreateTagInput): Promise<TagDto> {
    const notificationsSettings = createTag.notificationsSettings
      ? {
          ...this.DEFAULT_TAG_SETTINGS.notificationsSettings,
          ...createTag.notificationsSettings,
        }
      : this.DEFAULT_TAG_SETTINGS.notificationsSettings;

    const createdTag = await this.tagsRepository.createTag({
      ...this.DEFAULT_TAG_SETTINGS,
      userId: createTag.userId,
      name: createTag.name,
      description: createTag.description,
      color: createTag.color ?? this.DEFAULT_TAG_SETTINGS.color,
      answerMode: createTag.answerMode ?? this.DEFAULT_TAG_SETTINGS.answerMode,
      responseTimeMillis:
        createTag.responseTimeMillis ??
        this.DEFAULT_TAG_SETTINGS.responseTimeMillis,
      notificationsSettings,
    });

    return createdTag;
  }

  @Transactional()
  async listTags(userId: string, listTags: ListTagsInput): Promise<TagDto[]> {
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
  async updateTag(updateTag: UpdateTagInput): Promise<TagDto> {
    this.logger.info("Updating tag", {
      userId: updateTag.userId,
      tagId: updateTag.tagId,
    });

    const existing = await this.tagsRepository.getTagById(updateTag.tagId);
    if (!existing || existing.userId !== updateTag.userId) {
      throw new NotFoundException("Tag not found");
    }

    const updatePayload: Partial<{
      name: string;
      description?: string | null;
      color: string;
      answerMode: TagDto["answerMode"];
      responseTimeMillis: number;
      notificationsSettings: TagDto["notificationsSettings"];
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
  async deleteTag(userId: string, tagId: string): Promise<TagDto> {
    this.logger.info("Deleting tag", { userId, tagId });

    const existing = await this.tagsRepository.getTagById(tagId);
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException("Tag not found");
    }

    const deletedTag = await this.tagsRepository.deleteTagById(tagId);

    return deletedTag;
  }
}
