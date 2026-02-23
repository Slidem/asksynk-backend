import { TagDto } from "@/api/dtos/tagDto";
import {
  CreateTagRequestDto,
  ListTagsQueryDto,
  UpdateTagRequestDto,
} from "@/api/dtos/tagRequestsDto";
import { TagsService } from "@/api/services/tags.service";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { IdParam } from "../decorators/id.docorators";
import { EncodedResponseIds } from "@/api/decorators/id.docorators";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { AuthUser as AuthUserType } from "@/api/auth/auth.types";

@Controller("tags")
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @EncodedResponseIds("id")
  createTag(
    @Body() createTag: CreateTagRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TagDto> {
    return this.tagsService.createTag({
      ...createTag,
      answerMode:
        createTag.answerMode === "timeblock" ||
        createTag.answerMode === "immediately"
          ? createTag.answerMode
          : undefined,
      userId: user.id,
    });
  }

  @Get()
  @EncodedResponseIds("id")
  listTags(
    @Query() query: ListTagsQueryDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TagDto[]> {
    console.info("Received listTags request", { user, query });

    return this.tagsService.listTags(user.id, {
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
  }

  @Patch(":id")
  @EncodedResponseIds("id")
  updateTag(
    @IdParam("id") tagId: string,
    @Body() updateTag: UpdateTagRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TagDto> {
    return this.tagsService.updateTag({
      ...updateTag,
      userId: user.id,
      tagId,
    });
  }

  @Delete(":id")
  @EncodedResponseIds("id")
  deleteTag(
    @IdParam("id") tagId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<TagDto> {
    return this.tagsService.deleteTag(user.id, tagId);
  }
}
