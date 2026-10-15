import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { MessagingService } from "@/api/conversations/application/messaging.service";
import { ListMessagesQueryDto } from "@/api/conversations/presentation/rest/dto/list-messages-query.dto";
import { resolveAttachmentsByMessage } from "@/api/conversations/presentation/rest/message-attachments.helper";
import {
  toMessageResponseDto,
  toThreadMessageResponseDto,
} from "@/api/conversations/presentation/rest/messaging.mapper";
import {
  MessageResponseDto,
  ThreadMessageResponseDto,
} from "@/api/conversations/presentation/rest/responses/message.response";
import { ThreadStatsResponseDto } from "@/api/conversations/presentation/rest/responses/thread.response";
import { AttachmentCatalogPort } from "@/api/files/contract/attachment-catalog.port";
import { Actor } from "@/api/kernel/actor/actor";
import { UuidV7Param } from "@/api/platform/decorators/paramValidators.decorators";
import { ApiStandardErrors } from "@/api/platform/errors/swagger.decorator";
import { AllowGuest } from "@/api/platform/http/auth/allow-guest.decorator";
import { RequestActor } from "@/api/platform/http/auth/request-actor.decorator";

@ApiTags("Guest Messaging")
@ApiBearerAuth("bearer")
@ApiStandardErrors()
@Controller("public/thread")
export class GuestMessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly attachmentCatalog: AttachmentCatalogPort,
  ) {}

  /** List messages in the guest's thread */
  @AllowGuest()
  @Get("messages")
  async listMessages(
    @Query() query: ListMessagesQueryDto,
    @RequestActor() actor: Actor,
  ): Promise<ThreadMessageResponseDto[]> {
    const items = await this.messagingService.listMessages(
      actor,
      null,
      {
        before: query.before ? new Date(query.before) : undefined,
        limit: query.limit,
      },
    );
    const attachmentsByMessage = await resolveAttachmentsByMessage(
      this.attachmentCatalog,
      items.map((i) => i.message),
    );
    return items.map((i) =>
      toThreadMessageResponseDto(
        i,
        attachmentsByMessage.get(i.message.id) ?? [],
      ),
    );
  }

  /** Get tagged-message status counts for the guest's thread */
  @AllowGuest()
  @Get("stats")
  async getStats(
    @RequestActor() actor: Actor,
  ): Promise<ThreadStatsResponseDto> {
    return this.messagingService.getThreadStats(actor, null);
  }

  /** List all tagged messages in the guest's thread (not paginated) */
  @AllowGuest()
  @Get("tagged-messages")
  async listTaggedMessages(
    @RequestActor() actor: Actor,
  ): Promise<ThreadMessageResponseDto[]> {
    const items = await this.messagingService.listTaggedMessages(
      actor,
      null,
    );
    const attachmentsByMessage = await resolveAttachmentsByMessage(
      this.attachmentCatalog,
      items.map((i) => i.message),
    );
    return items.map((i) =>
      toThreadMessageResponseDto(
        i,
        attachmentsByMessage.get(i.message.id) ?? [],
      ),
    );
  }

  /** List replies to a message in the guest's thread */
  @AllowGuest()
  @Get("messages/:messageId/replies")
  async listReplies(
    @UuidV7Param("messageId") messageId: string,
    @Query() query: ListMessagesQueryDto,
    @RequestActor() actor: Actor,
  ): Promise<MessageResponseDto[]> {
    const replies = await this.messagingService.listReplies(
      actor,
      null,
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
