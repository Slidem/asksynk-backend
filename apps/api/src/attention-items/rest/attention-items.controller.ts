import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Query,
} from "@nestjs/common";

import { AttentionItemsService } from "@/api/attention-items/attention-items.service";
import { toAttentionItemResponse } from "@/api/attention-items/rest/attention-item.mapper";
import { ListAttentionItemsQueryDto } from "@/api/attention-items/rest/dto/list-attention-items-query.dto";
import { PatchAttentionItemDto } from "@/api/attention-items/rest/dto/patch-attention-item.dto";
import { AttentionItemResponse } from "@/api/attention-items/rest/responses/attention-item.response";
import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { UuidV7Param } from "@/api/common/decorators/param.decorators";
import { toNonNegativeNumberOptional } from "@/api/common/utils/inputs";

@Controller("attention-items")
export class AttentionItemsController {
  constructor(private readonly attentionItemsService: AttentionItemsService) {}

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
    return items.map(toAttentionItemResponse);
  }

  @Get(":id")
  async getAttentionItem(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<AttentionItemResponse> {
    const item = await this.attentionItemsService.getAttentionItem(user.id, id);
    return toAttentionItemResponse(item);
  }

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
    return toAttentionItemResponse(item);
  }

  @Delete(":id")
  @HttpCode(204)
  async deleteAttentionItem(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.attentionItemsService.deleteAttentionItem(user.id, id);
  }
}
