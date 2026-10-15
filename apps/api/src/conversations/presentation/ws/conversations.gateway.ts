import {
  ConnectedSocket,
  MessageBody,
  WebSocketGateway,
} from "@nestjs/websockets";
import { Socket } from "socket.io";

import { MessagingService } from "@/api/conversations/application/messaging.service";
import { SendMessageInput } from "@/api/conversations/application/send-message.model";
import { SendMessageDto } from "@/api/conversations/presentation/ws/dto/send-message.dto";
import { TagMessageDto } from "@/api/conversations/presentation/ws/dto/tag-message.dto";
import { ThreadSubscriptionDto } from "@/api/conversations/presentation/ws/dto/thread-subscription.dto";
import { UpdateMessageStatusDto } from "@/api/conversations/presentation/ws/dto/update-message-status.dto";
import { Actor } from "@/api/kernel/actor/actor";
import { roomOf } from "@/api/platform/realtime/realtime-broadcaster";
import { Ack } from "@/api/platform/realtime/ws-ack";
import { WsActor } from "@/api/platform/realtime/ws-actor.decorator";
import { WsCommand } from "@/api/platform/realtime/ws-command.decorator";
import { WS_GATEWAY_OPTIONS } from "@/api/platform/realtime/ws-gateway.options";

type SendAck = Ack<{ messageId: string; suggestionId: string | null }>;

/** Inbound messaging commands. Connection auth + room join live in WsGateway. */
@WebSocketGateway(WS_GATEWAY_OPTIONS)
export class ConversationsGateway {
  constructor(private readonly messagingService: MessagingService) {}

  @WsCommand("thread.subscribe")
  async onSubscribeThread(
    @WsActor() actor: Actor,
    @ConnectedSocket() socket: Socket,
    @MessageBody() dto: ThreadSubscriptionDto,
  ): Promise<Ack> {
    const allowed = await this.messagingService.canAccessThread(
      actor,
      dto.threadId,
    );

    if (!allowed) {
      return { ok: false, error: "forbidden" };
    }

    await socket.join(roomOf({ kind: "thread", id: dto.threadId }));
    return { ok: true };
  }

  @WsCommand("thread.unsubscribe")
  async onUnsubscribeThread(
    @ConnectedSocket() socket: Socket,
    @MessageBody() dto: ThreadSubscriptionDto,
  ): Promise<Ack> {
    await socket.leave(roomOf({ kind: "thread", id: dto.threadId }));
    return { ok: true };
  }

  @WsCommand("message.send")
  async onSendMessage(
    @WsActor() actor: Actor,
    @MessageBody() dto: SendMessageDto,
  ): Promise<SendAck> {
    const message = await this.messagingService.send(
      actor,
      toSendMessageInput(dto),
    );
    return {
      ok: true,
      messageId: message.id,
      suggestionId: message.suggestionId,
    };
  }

  @WsCommand("message.tag")
  async onTagMessage(
    @WsActor() actor: Actor,
    @MessageBody() dto: TagMessageDto,
  ): Promise<Ack> {
    await this.messagingService.tagMessage(
      actor,
      dto.messageId,
      dto.tagIds ?? [],
    );
    return { ok: true };
  }

  @WsCommand("message.updateStatus")
  async onUpdateMessageStatus(
    @WsActor() actor: Actor,
    @MessageBody() dto: UpdateMessageStatusDto,
  ): Promise<Ack> {
    await this.messagingService.updateManagedStatus(
      actor,
      dto.messageId,
      dto.status,
    );
    return { ok: true };
  }
}

function toSendMessageInput(dto: SendMessageDto): SendMessageInput {
  const suggestion = dto.taskSuggestion;
  return {
    threadId: dto.threadId ?? null,
    body: dto.body,
    tagIds: dto.tagIds ?? [],
    parentMessageId: dto.parentMessageId ?? null,
    attachmentIds: dto.attachmentIds ?? [],
    taskSuggestion: suggestion
      ? {
          kind: suggestion.kind,
          title: suggestion.title,
          description: suggestion.description ?? null,
          dueDate: suggestion.dueDate ?? null,
          tagIds: suggestion.tagIds ?? [],
          tasks:
            suggestion.kind === "batch"
              ? (suggestion.tasks ?? []).map((t) => ({
                  title: t.title ?? "",
                  description: t.description ?? null,
                }))
              : [],
        }
      : null,
  };
}
