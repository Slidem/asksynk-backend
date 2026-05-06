import { Controller, Get, Query } from "@nestjs/common";

import { AllowGuest } from "@/api/auth/allowGuest.decorator";
import { AuthGuest as AuthGuestType } from "@/api/auth/auth.types";
import { AuthGuest } from "@/api/auth/authGuest.decorator";
import { ListMessagesQueryDto } from "@/api/messaging/rest/dto/list-messages-query.dto";
import { toMessageResponseDto } from "@/api/messaging/rest/messaging.mapper";
import { MessageResponseDto } from "@/api/messaging/rest/responses/message.response";
import { MessagingService } from "@/api/messaging/services/messaging.service";

@Controller("public/thread")
export class GuestMessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @AllowGuest()
  @Get("messages")
  async listMessages(
    @Query() query: ListMessagesQueryDto,
    @AuthGuest() guest: AuthGuestType,
  ): Promise<MessageResponseDto[]> {
    const messages = await this.messagingService.listGuestThreadMessages(
      guest,
      {
        before: query.before ? new Date(query.before) : undefined,
        limit: query.limit,
      },
    );
    return messages.map(toMessageResponseDto);
  }
}
