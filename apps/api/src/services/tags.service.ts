import { ContextLogger } from "nestjs-context-logger";
import { CreateTagRequestDto } from "@/api/dtos/tagRequestsDto";
import { Injectable } from "@nestjs/common";
import { NatsService } from "@/api/services/nats.service";
import { TagDto } from "@/api/dtos/tagDto";
import { TagEventSubject } from "@/shared/events";
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
  async createTag(createTag: CreateTagRequestDto): Promise<TagDto> {
    this.logger.info("Creating tag", {
      userId: createTag.userId,
      name: createTag.name,
    });

    const createdTag = await this.tagsRepository.createTag({
      ...this.DEFAULT_TAG_SETTINGS,
      userId: createTag.userId,
      name: createTag.name,
      description: createTag.description,
    });

    this.natsService.publishTagEvent(TagEventSubject.Created, {
      id: createdTag.id,
      userId: createdTag.userId,
      name: createdTag.name,
    });

    return createdTag;
  }

  @Transactional()
  async putTag(putTag: CreateTagRequestDto): Promise<TagDto> {
    this.logger.info("Putting tag", {
      userId: putTag.userId,
      name: putTag.name,
    });

    const existing = await this.tagsRepository.getTagByName(putTag.name);
    if (!existing) {
      const createdTag = await this.tagsRepository.createTag({
        ...this.DEFAULT_TAG_SETTINGS,
        ...putTag,
      });

      this.natsService.publishTagEvent(TagEventSubject.Created, {
        id: createdTag.id,
        userId: createdTag.userId,
        name: createdTag.name,
      });

      return createdTag;
    } else {
      this.logger.info("Tag already exists, updating it instead", {
        name: putTag.name,
        existingTagId: existing.id,
      });

      const updatedTag = await this.tagsRepository.updateTag(existing.id, {
        ...this.DEFAULT_TAG_SETTINGS,
        ...putTag,
      });

      this.natsService.publishTagEvent(TagEventSubject.Updated, {
        id: updatedTag.id,
        userId: updatedTag.userId,
        name: updatedTag.name,
      });

      return updatedTag;
    }
  }

  @Transactional()
  async listTagsByUserId(userId: string): Promise<TagDto[]> {
    this.logger.info("Listing tags by user id", { userId });
    return this.tagsRepository.listTagsByUserId(userId);
  }
}
