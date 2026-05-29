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
import { pick } from "lodash";

import { AllowGuest } from "@/api/auth/allowGuest.decorator";
import {
  AuthUser as AuthUserType,
  RequestActor as RequestActorType,
} from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { RequestActor } from "@/api/auth/requestActor.decorator";
import { UuidV7Param } from "@/api/common/decorators/param.decorators";
import { toNonNegativeNumberOptional } from "@/api/common/utils/inputs";
import { NetworksService } from "@/api/networks/services/networks.service";
import { CreateTagRequestDto } from "@/api/tags/rest/dto/create-tag.dto";
import { ListTagsQueryDto } from "@/api/tags/rest/dto/list-tags-query.dto";
import { UpdateTagRequestDto } from "@/api/tags/rest/dto/update-tag.dto";
import { TagResponseDto } from "@/api/tags/rest/responses/tag.response";
import { toTagResponseDto } from "@/api/tags/rest/tag.mapper";
import { TagsService } from "@/api/tags/services/tags.service";

@Controller("tags")
export class TagsController {
  constructor(
    private readonly tagsService: TagsService,
    private readonly networksService: NetworksService,
  ) {}

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
  @AllowGuest()
  async listTags(
    @Query() query: ListTagsQueryDto,
    @RequestActor() actor: RequestActorType,
  ): Promise<TagResponseDto[]> {
    const targetUserId = await this.networksService.resolveTargetUserId(
      actor,
      query.userId,
    );

    const listInput = {
      ...pick(query, ["orderBy", "orderDirection", "search", "answerMode"]),
      limit: toNonNegativeNumberOptional(query.limit),
      offset: toNonNegativeNumberOptional(query.offset),
    };

    const tags = await this.tagsService.listTags(targetUserId, listInput);

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
  @HttpCode(204)
  async deleteTag(
    @UuidV7Param("id") tagId: string,
    @AuthUser() user: AuthUserType,
  ): Promise<TagResponseDto> {
    const tag = await this.tagsService.deleteTag(user.id, tagId);
    return toTagResponseDto(tag);
  }
}
