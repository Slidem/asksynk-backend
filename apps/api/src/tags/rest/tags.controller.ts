import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { pick } from "lodash";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { UuidV7Param } from "@/api/common/decorators/id.decorators";
import { toNonNegativeNumberOptional } from "@/api/common/utils/inputs";
import { CreateTagRequestDto } from "@/api/tags/rest/dto/create-tag.dto";
import { ListTagsQueryDto } from "@/api/tags/rest/dto/list-tags-query.dto";
import { UpdateTagRequestDto } from "@/api/tags/rest/dto/update-tag.dto";
import { TagResponseDto } from "@/api/tags/rest/responses/tag.response";
import { toTagResponseDto } from "@/api/tags/rest/tag.mapper";
import { TagsService } from "@/api/tags/services/tags.service";

@Controller("tags")
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  async createTag(
    @Body() createTag: CreateTagRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TagResponseDto> {
    const tag = await this.tagsService.createTag({
      ...createTag,
      userId: user.id,
    });

    return toTagResponseDto(tag);
  }

  @Get()
  async listTags(
    @Query() query: ListTagsQueryDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TagResponseDto[]> {
    const limit = toNonNegativeNumberOptional(query.limit);

    const offset = toNonNegativeNumberOptional(query.offset);

    const listInput = {
      ...pick(query, ["orderBy", "orderDirection", "search", "answerMode"]),
      limit,
      offset,
    };

    const tags = await this.tagsService.listTags(user.id, listInput);

    return tags.map(toTagResponseDto);
  }

  @Patch(":id")
  async updateTag(
    @UuidV7Param("id") tagId: string,
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
  async deleteTag(
    @UuidV7Param("id") tagId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<TagResponseDto> {
    const tag = await this.tagsService.deleteTag(user.id, tagId);
    return toTagResponseDto(tag);
  }
}
