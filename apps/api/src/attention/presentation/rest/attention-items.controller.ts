import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AttentionItemsService } from "@/api/attention/application/attention-items.service";
import { toAttentionItemView } from "@/api/attention/application/read/attention-item.view";
import { ListAttentionItemsQueryDto } from "@/api/attention/presentation/rest/dto/list-attention-items-query.dto";
import { PatchAttentionItemDto } from "@/api/attention/presentation/rest/dto/patch-attention-item.dto";
import { AttentionItemResponse } from "@/api/attention/presentation/rest/responses/attention-item.response";
import { UuidV7Param } from "@/api/platform/decorators/paramValidators.decorators";
import { ApiStandardErrors } from "@/api/platform/errors/swagger.decorator";
import { AuthUser as AuthUserType } from "@/api/platform/http/auth/auth.types";
import { AuthUser } from "@/api/platform/http/auth/auth-user.decorator";
import { toNonNegativeNumberOptional } from "@/api/platform/mappers/string.utils";

@ApiTags("Attention Items")
@ApiBearerAuth("bearer")
@ApiStandardErrors()
@Controller("attention-items")
export class AttentionItemsController {
  constructor(private readonly attentionItemsService: AttentionItemsService) {}

  /** List the current user's attention items, optionally filtered by status/type */
  @Get()
  async listAttentionItems(
    @Query() query: ListAttentionItemsQueryDto,
    @AuthUser() user: AuthUserType,
  ): Promise<AttentionItemResponse[]> {
    const items = await this.attentionItemsService.listAttentionItems(user.id, {
      status: query.status,
      type: query.type,
      cursor: query.cursor,
      limit: toNonNegativeNumberOptional(query.limit),
    });
    return items.map(toAttentionItemView);
  }

  /** Get a single attention item by id */
  @Get(":id")
  async getAttentionItem(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<AttentionItemResponse> {
    const item = await this.attentionItemsService.getAttentionItem(user.id, id);
    return toAttentionItemView(item);
  }

  /** Update an attention item's status, note, or tags */
  @Patch(":id")
  async updateAttentionItem(
    @UuidV7Param("id") id: string,
    @Body() body: PatchAttentionItemDto,
    @AuthUser() user: AuthUserType,
  ): Promise<AttentionItemResponse> {
    const item = await this.attentionItemsService.updateAttentionItem({
      id,
      userId: user.id,
      status: body.status,
      note: body.note,
      tagIds: body.tagIds,
    });
    return toAttentionItemView(item);
  }

  /** Delete an attention item */
  @Delete(":id")
  @HttpCode(204)
  async deleteAttentionItem(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.attentionItemsService.deleteAttentionItem(user.id, id);
  }
}
