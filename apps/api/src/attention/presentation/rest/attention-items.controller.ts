import { Controller, Delete, Get, HttpCode, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AttentionItemsService } from "@/api/attention/application/attention-items.service";
import { toAttentionItemView } from "@/api/attention/application/read/attention-item.view";
import { ListAttentionItemsQueryDto } from "@/api/attention/presentation/rest/dto/list-attention-items-query.dto";
import { AttentionItemResponse } from "@/api/attention/presentation/rest/responses/attention-item.response";
import { Actor } from "@/api/kernel/actor/actor";
import { UuidV7Param } from "@/api/platform/decorators/paramValidators.decorators";
import { ApiStandardErrors } from "@/api/platform/errors/swagger.decorator";
import { RequestActor } from "@/api/platform/http/auth/request-actor.decorator";
import { toNonNegativeNumberOptional } from "@/api/platform/mappers/string.utils";

// Read + delete only: items are projections; status changes go to the source.
@ApiTags("Attention Items")
@ApiBearerAuth("bearer")
@ApiStandardErrors()
@Controller("attention-items")
export class AttentionItemsController {
  constructor(private readonly attentionItemsService: AttentionItemsService) {}

  /** List the current user's attention items, optionally filtered by status/source kind */
  @Get()
  async listAttentionItems(
    @Query() query: ListAttentionItemsQueryDto,
    @RequestActor() actor: Actor,
  ): Promise<AttentionItemResponse[]> {
    const items = await this.attentionItemsService.listAttentionItems(actor, {
      status: query.status,
      sourceKind: query.sourceKind,
      cursor: query.cursor,
      limit: toNonNegativeNumberOptional(query.limit),
    });
    return items.map(toAttentionItemView);
  }

  /** Get a single attention item by id */
  @Get(":id")
  async getAttentionItem(
    @UuidV7Param("id") id: string,
    @RequestActor() actor: Actor,
  ): Promise<AttentionItemResponse> {
    const item = await this.attentionItemsService.getAttentionItem(actor, id);
    return toAttentionItemView(item);
  }

  /** Delete an attention item; permanent, no later source change revives it */
  @Delete(":id")
  @HttpCode(204)
  async deleteAttentionItem(
    @UuidV7Param("id") id: string,
    @RequestActor() actor: Actor,
  ): Promise<void> {
    await this.attentionItemsService.deleteAttentionItem(actor, id);
  }
}
