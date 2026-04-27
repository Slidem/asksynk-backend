import { Body, Controller, Get, Post, Query } from "@nestjs/common";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { UuidV7Param } from "@/api/common/decorators/id.decorators";
import { CreateThreadRequestDto } from "@/api/messaging/rest/dto/create-thread.dto";
import { ListMessagesQueryDto } from "@/api/messaging/rest/dto/list-messages-query.dto";
import { SendMessageRequestDto } from "@/api/messaging/rest/dto/send-message.dto";
import {
  toMessageResponseDto,
  toThreadListItemResponseDto,
} from "@/api/messaging/rest/messaging.mapper";
import { MessageResponseDto } from "@/api/messaging/rest/responses/message.response";
import {
  CreateThreadResponseDto,
  ThreadListItemResponseDto,
} from "@/api/messaging/rest/responses/thread.response";
import { MessagingService } from "@/api/messaging/services/messaging.service";

@Controller("threads")
export class ThreadsController {
  constructor(private readonly messagingService: MessagingService) {}

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
  ): Promise<MessageResponseDto[]> {
    const messages = await this.messagingService.listThreadMessages(
      user.id,
      threadId,
      {
        before: query.before ? new Date(query.before) : undefined,
        limit: query.limit,
      },
    );
    return messages.map(toMessageResponseDto);
  }

  @Post(":id/messages")
  async sendMessage(
    @UuidV7Param("id") threadId: string,
    @Body() dto: SendMessageRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<MessageResponseDto> {
    const message = await this.messagingService.sendAsUser(
      user.id,
      threadId,
      dto.body,
    );
    return toMessageResponseDto(message);
  }
}
