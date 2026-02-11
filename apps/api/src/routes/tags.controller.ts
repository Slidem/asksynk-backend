import { TagDto } from "@/api/dtos/tagDto";
import {
  CreateTagRequestDto,
  ListTagsByUserIdRequestDto,
} from "@/api/dtos/tagRequestsDto";
import { TagsService } from "@/api/services/tags.service";
import { Body, Controller, Get, Post, Put, Query } from "@nestjs/common";

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

  @Put()
  putTag(@Body() putTag: CreateTagRequestDto): Promise<TagDto> {
    return this.tagsService.putTag(putTag);
  }
}
