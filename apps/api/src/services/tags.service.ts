import { ContextLogger } from "nestjs-context-logger";
import { CreateTagRequestDto } from "@/api/dtos/tagRequestsDto";
import { Injectable } from "@nestjs/common";
import { TagDto } from "@/api/dtos/tagDto";
import { TagRepository } from "@/api/repository/tag.repository";

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

  constructor(private readonly tagsRepository: TagRepository) {}

  async createTag(createTag: CreateTagRequestDto): Promise<TagDto> {
    this.logger.info("Creating tag", {
      userId: createTag.userId,
      name: createTag.name,
    });

    return this.tagsRepository.createTag({
      ...this.DEFAULT_TAG_SETTINGS,
      userId: createTag.userId,
      name: createTag.name,
      description: createTag.description,
    });
  }

  async listTagsByUserId(userId: string): Promise<TagDto[]> {
    this.logger.info("Listing tags by user id", { userId });
    return this.tagsRepository.listTagsByUserId(userId);
  }
}
