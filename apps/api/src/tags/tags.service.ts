import { CreateTagInput, UpdateTagInput } from "@/api/tags/tags-request.dto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { defaultsDeep, pick, pickBy } from "lodash";

import { ContextLogger } from "nestjs-context-logger";
import { ListTagsInput } from "./tags.model";
import { Tag } from "@/api/tags/tag.entity";
import { TagRepository } from "@/api/tags/tags.repository";
import { Transactional } from "@nestjs-cls/transactional";

@Injectable()
export class TagsService {
  private readonly logger = new ContextLogger(TagsService.name);
  constructor(private readonly tagsRepository: TagRepository) {}

  @Transactional()
  async createTag(createTag: CreateTagInput): Promise<Tag> {
    const payload: CreateTagInput = defaultsDeep(createTag, Tag.defaults());
    return this.tagsRepository.createTag(payload);
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

    const updatePayload = pickBy(
      pick(updateTag, [
        "name",
        "description",
        "color",
        "answerMode",
        "responseTimeMillis",
        "notificationsSettings",
      ]),
      (v) => v !== undefined,
    );

    return this.tagsRepository.updateTagById(updateTag.tagId, updatePayload);
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
