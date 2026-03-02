import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import {
  EncodedResponseIds,
  IdParam,
} from "@/api/common/decorators/id.decorators";
import { AnswerMode } from "@/api/tags/tags.model";
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
import { AsksynkError } from "../common/errors/errors.model";
import { toTagResponseDto } from "./tags.mappers";
import {
  CreateTagRequestDto,
  ListTagsQueryDto,
  TagResponseDto,
  UpdateTagRequestDto,
} from "./tags.rest-dto";
import { pick } from "lodash";

@Controller("tags")
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @EncodedResponseIds("id")
  async createTag(
    @Body() createTag: CreateTagRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TagResponseDto> {
    this.validateAnswerMode(createTag.answerMode);

    const tag = await this.tagsService.createTag({
      ...createTag,
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
    this.validateListTagsQuery(query);

    const limit: number | undefined =
      query.limit !== undefined ? Math.max(0, Number(query.limit)) : undefined;

    const offset: number | undefined =
      query.offset !== undefined
        ? Math.max(0, Number(query.offset))
        : undefined;

    const listInput = {
      ...pick(query, ["orderBy", "orderDirection", "search"]),
      limit,
      offset,
    };

    const tags = await this.tagsService.listTags(user.id, listInput);
    return tags.map(toTagResponseDto);
  }

  @Patch(":id")
  @EncodedResponseIds("id")
  async updateTag(
    @IdParam("id") tagId: string,
    @Body() updateTag: UpdateTagRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TagResponseDto> {
    this.validateAnswerMode(updateTag.answerMode);

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

  private validateAnswerMode(input: AnswerMode | undefined) {
    if (!input) return undefined;

    if (input.type !== "immediately" && input.type !== "timeblock") {
      throw AsksynkError.badRequest("Invalid answer mode type");
    }

    if (
      input.type === "immediately" &&
      (!input.responseTimeMillis ||
        typeof input.responseTimeMillis !== "number")
    ) {
      throw AsksynkError.badRequest(
        "For 'immediately' answer mode, 'responseTimeMillis' must be a number",
      );
    }
  }

  private validateListTagsQuery(input: ListTagsQueryDto) {
    if (input.answerMode) {
      if (
        input.answerMode !== "immediately" &&
        input.answerMode !== "timeblock"
      ) {
        throw AsksynkError.badRequest("Invalid answer mode type");
      }
    }

    if (input.orderBy) {
      if (input.orderBy !== "createdAt" && input.orderBy !== "updatedAt") {
        throw AsksynkError.badRequest("Invalid orderBy value");
      }
    }

    if (input.orderDirection) {
      if (input.orderDirection !== "asc" && input.orderDirection !== "desc") {
        throw AsksynkError.badRequest("Invalid orderDirection value");
      }
    }

    if (input.limit !== undefined) {
      const limitNum = Number(input.limit);
      if (!Number.isFinite(limitNum) || limitNum < 0) {
        throw AsksynkError.badRequest("Limit must be a non-negative number");
      }
    }

    if (input.offset !== undefined) {
      const offsetNum = Number(input.offset);
      if (!Number.isFinite(offsetNum) || offsetNum < 0) {
        throw AsksynkError.badRequest("Offset must be a non-negative number");
      }
    }
  }
}
