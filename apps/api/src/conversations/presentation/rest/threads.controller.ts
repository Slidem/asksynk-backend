import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { MessagingService } from "@/api/conversations/application/messaging.service";
import { CreateThreadRequestDto } from "@/api/conversations/presentation/rest/dto/create-thread.dto";
import { ListMessagesQueryDto } from "@/api/conversations/presentation/rest/dto/list-messages-query.dto";
import { resolveAttachmentsByMessage } from "@/api/conversations/presentation/rest/message-attachments.helper";
import {
  toMessageResponseDto,
  toThreadListItemResponseDto,
  toThreadMessageResponseDto,
} from "@/api/conversations/presentation/rest/messaging.mapper";
import {
  MessageResponseDto,
  ThreadMessageResponseDto,
} from "@/api/conversations/presentation/rest/responses/message.response";
import {
  CreateThreadResponseDto,
  ThreadListItemResponseDto,
  ThreadStatsResponseDto,
} from "@/api/conversations/presentation/rest/responses/thread.response";
import { AttachmentCatalogPort } from "@/api/files/contract/attachment-catalog.port";
import { Actor } from "@/api/kernel/actor/actor";
import { UuidV7Param } from "@/api/platform/decorators/paramValidators.decorators";
import { ApiStandardErrors } from "@/api/platform/errors/swagger.decorator";
import { RequestActor } from "@/api/platform/http/auth/request-actor.decorator";

@ApiTags("Threads")
@ApiBearerAuth("bearer")
@ApiStandardErrors()
@Controller("threads")
export class ThreadsController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly attachmentCatalog: AttachmentCatalogPort,
  ) {}

  /** List the current user's threads */
  @Get()
  async list(
    @RequestActor() actor: Actor,
  ): Promise<ThreadListItemResponseDto[]> {
    const items = await this.messagingService.listThreads(actor);
    return items.map(toThreadListItemResponseDto);
  }

  /** Create or get the 1:1 thread with another user */
  @Post()
  async createOrGet(
    @Body() dto: CreateThreadRequestDto,
    @RequestActor() actor: Actor,
  ): Promise<CreateThreadResponseDto> {
    const thread = await this.messagingService.createOrGetUserThread(
      actor,
      dto.recipientUserId,
    );
    return { threadId: thread.id };
  }

  /** Get tagged-message status counts for a thread */
  @Get(":id/stats")
  async getStats(
    @UuidV7Param("id") threadId: string,
    @RequestActor() actor: Actor,
  ): Promise<ThreadStatsResponseDto> {
    return this.messagingService.getThreadStats(actor, threadId);
  }

  /** List all tagged messages in a thread (not paginated) */
  @Get(":id/tagged-messages")
  async listTaggedMessages(
    @UuidV7Param("id") threadId: string,
    @RequestActor() actor: Actor,
  ): Promise<ThreadMessageResponseDto[]> {
    const items = await this.messagingService.listTaggedMessages(
      actor,
      threadId,
    );
    const attachmentsByMessage = await resolveAttachmentsByMessage(
      this.attachmentCatalog,
      items.map((i) => i.message),
    );
    return items.map((item) =>
      toThreadMessageResponseDto(
        item,
        attachmentsByMessage.get(item.message.id) ?? [],
      ),
    );
  }

  /** List messages in a thread (newest first, cursor via `before`) */
  @Get(":id/messages")
  async listMessages(
    @UuidV7Param("id") threadId: string,
    @Query() query: ListMessagesQueryDto,
    @RequestActor() actor: Actor,
  ): Promise<ThreadMessageResponseDto[]> {
    const items = await this.messagingService.listMessages(actor, threadId, {
      before: query.before ? new Date(query.before) : undefined,
      limit: query.limit,
    });

    const attachmentsByMessage = await resolveAttachmentsByMessage(
      this.attachmentCatalog,
      items.map((i) => i.message),
    );

    return items.map((item) =>
      toThreadMessageResponseDto(
        item,
        attachmentsByMessage.get(item.message.id) ?? [],
      ),
    );
  }

  /** List replies to a message in a thread */
  @Get(":id/messages/:messageId/replies")
  async listReplies(
    @UuidV7Param("id") threadId: string,
    @UuidV7Param("messageId") messageId: string,
    @Query() query: ListMessagesQueryDto,
    @RequestActor() actor: Actor,
  ): Promise<MessageResponseDto[]> {
    const replies = await this.messagingService.listReplies(
      actor,
      threadId,
      messageId,
      {
        before: query.before ? new Date(query.before) : undefined,
        limit: query.limit,
      },
    );
    const attachmentsByMessage = await resolveAttachmentsByMessage(
      this.attachmentCatalog,
      replies,
    );
    return replies.map((r) =>
      toMessageResponseDto(r, attachmentsByMessage.get(r.id) ?? []),
    );
  }
}
