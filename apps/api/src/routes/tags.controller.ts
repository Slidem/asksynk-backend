import {
  CreateTagRequestDto,
  ListTagsByUserIdRequestDto,
} from "@/api/dtos/tagRequestsDto";
import { TagDto } from "@/api/dtos/tagDto";
import { TagsService } from "@/api/services/tags.service";
import { Body, Controller, Get, Post, Query } from "@nestjs/common";

@Controller("tags")
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  createTag(@Body() createTag: CreateTagRequestDto): Promise<TagDto> {
    return this.tagsService.createTag(createTag);
  }

  @Get()
  listTagsByUserId(
    @Query() query: ListTagsByUserIdRequestDto,
  ): Promise<TagDto[]> {
    return this.tagsService.listTagsByUserId(query.userId);
  }
}
