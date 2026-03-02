import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { EncodedResponseIds, IdParam } from "@/api/common/decorators/id.decorators";
import { TagResponseDto, toTagResponseDto } from "@/api/tags/tags.dto";
import {
  CreateTagRequestDto,
  ListTagsQueryDto,
  UpdateTagRequestDto,
} from "@/api/tags/tags-request.dto";
import { TagsService } from "@/api/tags/tags.service";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

@Controller("tags")
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @EncodedResponseIds("id")
  async createTag(
    @Body() createTag: CreateTagRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TagResponseDto> {
    const tag = await this.tagsService.createTag({
      ...createTag,
      answerMode:
        createTag.answerMode === "timeblock" ||
        createTag.answerMode === "immediately"
          ? createTag.answerMode
          : undefined,
      userId: user.id,
    });
    return toTagResponseDto(tag);
  }

  @Get()
  @EncodedResponseIds("id")
  async listTags(
    @Query() query: ListTagsQueryDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TagResponseDto[]> {
    const tags = await this.tagsService.listTags(user.id, {
      answerMode:
        query.answerMode === "timeblock" || query.answerMode === "immediately"
          ? query.answerMode
          : undefined,
      orderBy:
        query.orderBy === "createdAt" || query.orderBy === "updatedAt"
          ? query.orderBy
          : undefined,
      orderDirection:
        query.orderDirection === "asc" || query.orderDirection === "desc"
          ? query.orderDirection
          : undefined,
      search:
        query.search && query.search.trim().length >= 3
          ? query.search.trim()
          : undefined,
      limit:
        query.limit !== undefined && Number.isFinite(Number(query.limit))
          ? Math.max(0, Number(query.limit))
          : undefined,
      offset:
        query.offset !== undefined && Number.isFinite(Number(query.offset))
          ? Math.max(0, Number(query.offset))
          : undefined,
    });
    return tags.map(toTagResponseDto);
  }

  @Patch(":id")
  @EncodedResponseIds("id")
  async updateTag(
    @IdParam("id") tagId: string,
    @Body() updateTag: UpdateTagRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TagResponseDto> {
    const tag = await this.tagsService.updateTag({
      ...updateTag,
      userId: user.id,
      tagId,
    });
    return toTagResponseDto(tag);
  }

  @Delete(":id")
  @EncodedResponseIds("id")
  async deleteTag(
    @IdParam("id") tagId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<TagResponseDto> {
    const tag = await this.tagsService.deleteTag(user.id, tagId);
    return toTagResponseDto(tag);
  }
}
