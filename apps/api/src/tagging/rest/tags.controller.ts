import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { pick } from "lodash";

import { AllowGuest } from "@/api/auth/allowGuest.decorator";
import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { RequestActor } from "@/api/auth/requestActor.decorator";
import { Actor } from "@/api/kernel/actor/actor";
import { UuidV7Param } from "@/api/platform/decorators/paramValidators.decorators";
import { ApiStandardErrors } from "@/api/platform/errors/swagger.decorator";
import { toNonNegativeNumberOptional } from "@/api/platform/mappers/string.utils";
import { CreateTagRequestDto } from "@/api/tagging/rest/dto/create-tag.dto";
import { ListTagsQueryDto } from "@/api/tagging/rest/dto/list-tags-query.dto";
import { UpdateTagRequestDto } from "@/api/tagging/rest/dto/update-tag.dto";
import { TagResponseDto } from "@/api/tagging/rest/responses/tag.response";
import { toTagResponseDto } from "@/api/tagging/rest/tag.mapper";
import { TagsService } from "@/api/tagging/services/tags.service";

@ApiTags("Tags")
@ApiBearerAuth("bearer")
@ApiStandardErrors()
@Controller("tags")
export class TagsController {
  constructor(
    private readonly tagsService: TagsService,
  ) {}

  /** Create a tag for the current user */
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

  /** List tags for a user (self, or a network member via userId) */
  @Get()
  @AllowGuest()
  async listTags(
    @Query() query: ListTagsQueryDto,
    @RequestActor() actor: Actor,
  ): Promise<TagResponseDto[]> {
    const listInput = {
      ...pick(query, [
        "userId",
        "orderBy",
        "orderDirection",
        "search",
        "answerMode",
      ]),
      limit: toNonNegativeNumberOptional(query.limit),
      offset: toNonNegativeNumberOptional(query.offset),
    };

    const tags = await this.tagsService.listTags(actor, listInput);

    return tags.map(toTagResponseDto);
  }

  /** Update a tag */
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

  /** Delete a tag */
  @Delete(":id")
  @HttpCode(204)
  async deleteTag(
    @UuidV7Param("id") tagId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<TagResponseDto> {
    const tag = await this.tagsService.deleteTag(user.id, tagId);
    return toTagResponseDto(tag);
  }
}
