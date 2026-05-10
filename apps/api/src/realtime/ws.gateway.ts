import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { ContextLogger } from "nestjs-context-logger";
import { Server, Socket } from "socket.io";

import { AsksynkError } from "@/api/common/errors/errors.model";
import { MessagingService } from "@/api/messaging/services/messaging.service";
import { Ack, SendAck } from "@/api/realtime/ws.types";
import { EventHandler } from "@/shared/event-consumer/event-consumer.decorator";
import {
  MessageCreated,
  MessageUpdated,
} from "@/shared/event-registry/events.registry";
import { EventOf } from "@/shared/event-registry/events.types";

import { WsAuthService, WsIdentity } from "./services/ws-auth.service";
import { guestRoom, threadRoom, userRoom } from "./ws.rooms";

@WebSocketGateway({ cors: true })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new ContextLogger(WsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly wsAuthService: WsAuthService,
    private readonly messagingService: MessagingService,
  ) {}

  /**
   * Overridden method from OnGatewayConnection to handle new socket connections. Authenticates the socket and assigns the identity to socket.data.identity. Joins the user or guest room based on the identity.
   * @param socket
   * @returns
   */
  async handleConnection(socket: Socket): Promise<void> {
    const identity = await this.wsAuthService.authenticateSocket(socket);

    if (!identity) {
      socket.emit("error", { code: "unauthorized", message: "auth failed" });
      socket.disconnect(true);
      return;
    }

    socket.data.identity = identity;

    if (identity.kind === "user") {
      await socket.join(userRoom(identity.user.id));
    } else {
      await socket.join(guestRoom(identity.guest.id));
    }
  }

  /**
   * Overridden method from OnGatewayDisconnect to handle socket disconnections. Logs the disconnection event.
   *
   * @param socket
   */
  handleDisconnect(socket: Socket): void {
    this.logger.debug("ws disconnect", { sid: socket.id });
  }

  @SubscribeMessage("thread.subscribe")
  async onSubscribeThread(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { threadId?: string },
  ): Promise<Ack> {
    const identity = socket.data.identity as WsIdentity | undefined;

    if (!identity) {
      return { ok: false, error: "unauthorized" };
    }

    if (!body?.threadId) {
      return { ok: false, error: "threadId required" };
    }

    const allowed = await this.messagingService.canAccessThread(
      identity,
      body.threadId,
    );

    if (!allowed) {
      return { ok: false, error: "forbidden" };
    }

    await socket.join(threadRoom(body.threadId));
    return { ok: true };
  }

  @SubscribeMessage("thread.unsubscribe")
  async onUnsubscribeThread(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { threadId?: string },
  ): Promise<Ack> {
    if (!body?.threadId) {
      return { ok: false, error: "threadId required" };
    }
    await socket.leave(threadRoom(body.threadId));
    return { ok: true };
  }

  @SubscribeMessage("message.send")
  async onSendMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    body: {
      threadId?: string;
      body?: string;
      tagIds?: string[];
      parentMessageId?: string;
    },
  ): Promise<SendAck> {
    const identity = socket.data.identity as WsIdentity | undefined;
    if (!identity) {
      return { ok: false, error: "unauthorized" };
    }

    const text = (body?.body ?? "").trim();
    if (!text) {
      return { ok: false, error: "body required" };
    }

    const tagIds = body?.tagIds ?? [];
    if (
      !Array.isArray(tagIds) ||
      !tagIds.every((id) => typeof id === "string")
    ) {
      return { ok: false, error: "tagIds must be string[]" };
    }

    const parentMessageId = body?.parentMessageId ?? null;

    try {
      if (identity.kind === "user") {
        if (!body?.threadId) {
          return { ok: false, error: "threadId required" };
        }
        const message = await this.messagingService.sendAsUser(
          identity.user.id,
          body.threadId,
          text,
          tagIds,
          parentMessageId,
        );
        return { ok: true, messageId: message.id };
      }

      if (tagIds.length > 0) {
        return { ok: false, error: "Guests cannot tag" };
      }

      const message = await this.messagingService.sendAsGuest(
        identity.guest,
        text,
        parentMessageId,
      );
      return { ok: true, messageId: message.id };
    } catch (error) {
      if (error instanceof AsksynkError) {
        return { ok: false, error: error.message };
      }
      this.logger.error("message.send failed", { error });
      return { ok: false, error: "internal_error" };
    }
  }

  @SubscribeMessage("message.tag")
  async onTagMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { messageId?: string; tagIds?: string[] },
  ): Promise<Ack> {
    const identity = socket.data.identity as WsIdentity | undefined;
    if (!identity) {
      return { ok: false, error: "unauthorized" };
    }
    if (identity.kind !== "user") {
      return { ok: false, error: "forbidden" };
    }
    if (!body?.messageId) {
      return { ok: false, error: "messageId required" };
    }
    const tagIds = body?.tagIds ?? [];
    if (
      !Array.isArray(tagIds) ||
      !tagIds.every((id) => typeof id === "string")
    ) {
      return { ok: false, error: "tagIds must be string[]" };
    }

    try {
      await this.messagingService.tagMessage(
        identity.user.id,
        body.messageId,
        tagIds,
      );
      return { ok: true };
    } catch (error) {
      if (error instanceof AsksynkError) {
        return { ok: false, error: error.message };
      }
      this.logger.error("message.tag failed", { error });
      return { ok: false, error: "internal_error" };
    }
  }

  @EventHandler(MessageCreated)
  async onMessageCreated(
    payload: EventOf<typeof MessageCreated>,
  ): Promise<void> {
    const rooms = new Set<string>([threadRoom(payload.threadId)]);
    for (const userId of payload.participantUserIds) {
      rooms.add(userRoom(userId));
    }
    for (const guestId of payload.participantGuestIds) {
      rooms.add(guestRoom(guestId));
    }
    this.server.to([...rooms]).emit("message.created", {
      threadId: payload.threadId,
      message: payload.message,
    });
  }

  @EventHandler(MessageUpdated)
  async onMessageUpdated(
    payload: EventOf<typeof MessageUpdated>,
  ): Promise<void> {
    this.server.to(threadRoom(payload.threadId)).emit("message.updated", {
      threadId: payload.threadId,
      message: payload.message,
    });
  }
}
