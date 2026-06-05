import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import { defaultsDeep, pick, pickBy } from "lodash";
import { ContextLogger } from "nestjs-context-logger";
import { UUID } from "uuidv7";

import { AsksynkError } from "@/api/common/errors/errors.model";
import { Tag } from "@/api/tags/entities/tag.entity";
import { CreateTagInput } from "@/api/tags/models/create-tag.model";
import { ListTagsInput } from "@/api/tags/models/list-tags.model";
import { UpdateTagInput } from "@/api/tags/models/update-tag.model";
import { TagRepository } from "@/api/tags/repositories/tags.repository";
import { EventsPublisher } from "@/shared/event-publisher/events-publisher";
import {
  TagDeleted,
  TagUpdated,
} from "@/shared/event-registry/events.registry";

@Injectable()
export class TagsService {
  private readonly logger = new ContextLogger(TagsService.name);
  constructor(
    private readonly tagsRepository: TagRepository,
    private readonly eventsPublisher: EventsPublisher,
  ) {}

  @Transactional()
  async createTag(createTag: CreateTagInput): Promise<Tag> {
    const payload = defaultsDeep(createTag, Tag.defaults());
    const tag = Tag.create({
      id: UUID.parse(createTag.id)!,
      userId: payload.userId,
      name: payload.name,
      description: payload.description,
      color: payload.color,
      answerMode: payload.answerMode,
      notificationsSettings: payload.notificationsSettings,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.tagsRepository.add(tag);
  }

  @Transactional()
  async listTags(userId: string, listTags: ListTagsInput): Promise<Tag[]> {
    return this.tagsRepository.listByUserIdWithFilters(userId, {
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
    const existing = await this.tagsRepository.getById(updateTag.tagId);

    if (!existing || !existing.belongsTo(updateTag.userId)) {
      throw AsksynkError.notFound("Tag not found");
    }

    const updates = pickBy(
      pick(updateTag, [
        "name",
        "description",
        "color",
        "answerMode",
        "notificationsSettings",
      ]),
      (v) => v !== undefined,
    );
    Object.assign(existing, updates);
    const updated = await this.tagsRepository.update(existing);

    await this.eventsPublisher.publish(TagUpdated, {
      id: updated.id.toString(),
      name: updated.name,
      userId: updated.userId,
      answerModeType: updated.answerMode.type,
    });

    return updated;
  }

  @Transactional()
  async deleteTag(userId: string, tagId: string): Promise<Tag> {
    const existing = await this.tagsRepository.getById(tagId);
    if (!existing || !existing.belongsTo(userId)) {
      throw AsksynkError.notFound("Tag not found");
    }
    const tag = await this.tagsRepository.delete(tagId);

    await this.eventsPublisher.publish(TagDeleted, {
      tagId,
      userId,
    });

    return tag;
  }

  async assertOwnedBy(userId: string, tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) return;
    const found = await this.tagsRepository.getByIds(tagIds);
    if (
      found.length !== tagIds.length ||
      !found.every((t) => t.belongsTo(userId))
    ) {
      throw AsksynkError.badRequest("One or more tags not found");
    }
  }
}
