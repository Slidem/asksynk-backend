import { CreateTagInput, UpdateTagInput } from "@/api/tags/tags.model";
import { Injectable, NotFoundException } from "@nestjs/common";
import { defaultsDeep, pick, pickBy } from "lodash";

import { ContextLogger } from "nestjs-context-logger";
import { ListTagsInput } from "@/api/tags/tags.model";
import { Tag } from "@/api/tags/tag.entity";
import { TagRepository } from "@/api/tags/tags.repository";
import { Transactional } from "@nestjs-cls/transactional";
import { UUID } from "uuidv7";

@Injectable()
export class TagsService {
  private readonly logger = new ContextLogger(TagsService.name);
  constructor(private readonly tagsRepository: TagRepository) {}

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
    this.logger.info("Listing tags", { userId, listTags });

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
    this.logger.info("Updating tag", {
      userId: updateTag.userId,
      tagId: updateTag.tagId,
    });

    const existing = await this.tagsRepository.getById(updateTag.tagId);

    if (!existing || !existing.belongsTo(updateTag.userId)) {
      throw new NotFoundException("Tag not found");
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

    return this.tagsRepository.update(existing);
  }

  @Transactional()
  async deleteTag(userId: string, tagId: string): Promise<Tag> {
    this.logger.info("Deleting tag", { userId, tagId });

    const existing = await this.tagsRepository.getById(tagId);
    if (!existing || !existing.belongsTo(userId)) {
      throw new NotFoundException("Tag not found");
    }
    return this.tagsRepository.delete(tagId);
  }
}
