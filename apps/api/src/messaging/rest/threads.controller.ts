import { Body, Controller, Get, Post, Query } from "@nestjs/common";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { UuidV7Param } from "@/api/common/decorators/param.decorators";
import { CreateThreadRequestDto } from "@/api/messaging/rest/dto/create-thread.dto";
import { ListMessagesQueryDto } from "@/api/messaging/rest/dto/list-messages-query.dto";
import { resolveAttachmentsByMessage } from "@/api/messaging/rest/message-attachments.helper";
import {
  toMessageResponseDto,
  toThreadListItemResponseDto,
  toThreadMessageResponseDto,
} from "@/api/messaging/rest/messaging.mapper";
import {
  MessageResponseDto,
  ThreadMessageResponseDto,
} from "@/api/messaging/rest/responses/message.response";
import {
  CreateThreadResponseDto,
  ThreadListItemResponseDto,
} from "@/api/messaging/rest/responses/thread.response";
import { MessagingService } from "@/api/messaging/services/messaging.service";
import { AttachmentsService } from "@/api/storage/attachments/services/attachments.service";

@Controller("threads")
export class ThreadsController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly attachmentService: AttachmentsService,
  ) {}

  @Get()
  async list(
    @AuthUser() user: AuthUserType,
  ): Promise<ThreadListItemResponseDto[]> {
    const items = await this.messagingService.listThreadsForUser(user.id);
    return items.map(toThreadListItemResponseDto);
  }

  @Post()
  async createOrGet(
    @Body() dto: CreateThreadRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<CreateThreadResponseDto> {
    const thread = await this.messagingService.createOrGetUserThread(
      user.id,
      dto.recipientUserId,
    );
    return { threadId: thread.id };
  }

  @Get(":id/messages")
  async listMessages(
    @UuidV7Param("id") threadId: string,
    @Query() query: ListMessagesQueryDto,
    @AuthUser() user: AuthUserType,
  ): Promise<ThreadMessageResponseDto[]> {
    const items = await this.messagingService.listThreadMessages(
      user.id,
      threadId,
      {
        before: query.before ? new Date(query.before) : undefined,
        limit: query.limit,
      },
    );

    const attachmentsByMessage = await resolveAttachmentsByMessage(
      this.attachmentService,
      items.map((i) => i.message),
    );

    return items.map((item) =>
      toThreadMessageResponseDto(
        item,
        attachmentsByMessage.get(item.message.id) ?? [],
      ),
    );
  }

  @Get(":id/messages/:messageId/replies")
  async listReplies(
    @UuidV7Param("id") threadId: string,
    @UuidV7Param("messageId") messageId: string,
    @Query() query: ListMessagesQueryDto,
    @AuthUser() user: AuthUserType,
  ): Promise<MessageResponseDto[]> {
    const replies = await this.messagingService.listThreadMessageReplies(
      user.id,
      threadId,
      messageId,
      {
        before: query.before ? new Date(query.before) : undefined,
        limit: query.limit,
      },
    );
    const attachmentsByMessage = await resolveAttachmentsByMessage(
      this.attachmentService,
      replies,
    );
    return replies.map((r) =>
      toMessageResponseDto(r, attachmentsByMessage.get(r.id) ?? []),
    );
  }
}
