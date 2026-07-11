import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AllowGuest } from "@/api/auth/allowGuest.decorator";
import { AuthGuest as AuthGuestType } from "@/api/auth/auth.types";
import { AuthGuest } from "@/api/auth/authGuest.decorator";
import { UuidV7Param } from "@/api/common/decorators/param.decorators";
import { ApiStandardErrors } from "@/api/common/errors/api-error-responses.decorator";
import { ListMessagesQueryDto } from "@/api/messaging/rest/dto/list-messages-query.dto";
import { resolveAttachmentsByMessage } from "@/api/messaging/rest/message-attachments.helper";
import {
  toMessageResponseDto,
  toThreadMessageResponseDto,
} from "@/api/messaging/rest/messaging.mapper";
import {
  MessageResponseDto,
  ThreadMessageResponseDto,
} from "@/api/messaging/rest/responses/message.response";
import { ThreadStatsResponseDto } from "@/api/messaging/rest/responses/thread.response";
import { MessagingService } from "@/api/messaging/services/messaging.service";
import { AttachmentsService } from "@/api/storage/attachments/services/attachments.service";

@ApiTags("Guest Messaging")
@ApiBearerAuth("bearer")
@ApiStandardErrors()
@Controller("public/thread")
export class GuestMessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly attachmentService: AttachmentsService,
  ) {}

  /** List messages in the guest's thread */
  @AllowGuest()
  @Get("messages")
  async listMessages(
    @Query() query: ListMessagesQueryDto,
    @AuthGuest() guest: AuthGuestType,
  ): Promise<ThreadMessageResponseDto[]> {
    const items = await this.messagingService.listGuestThreadMessages(guest, {
      before: query.before ? new Date(query.before) : undefined,
      limit: query.limit,
    });
    const attachmentsByMessage = await resolveAttachmentsByMessage(
      this.attachmentService,
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
    @AuthGuest() guest: AuthGuestType,
  ): Promise<ThreadStatsResponseDto> {
    return this.messagingService.getGuestThreadStats(guest);
  }

  /** List all tagged messages in the guest's thread (not paginated) */
  @AllowGuest()
  @Get("tagged-messages")
  async listTaggedMessages(
    @AuthGuest() guest: AuthGuestType,
  ): Promise<ThreadMessageResponseDto[]> {
    const items =
      await this.messagingService.listGuestThreadTaggedMessages(guest);
    const attachmentsByMessage = await resolveAttachmentsByMessage(
      this.attachmentService,
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
    @AuthGuest() guest: AuthGuestType,
  ): Promise<MessageResponseDto[]> {
    const replies = await this.messagingService.listGuestMessageReplies(
      guest,
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
