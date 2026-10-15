import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { ContextLogger } from "nestjs-context-logger";
import { Server, Socket } from "socket.io";

import { ActorAuthenticator } from "@/api/auth/contract/actor-authenticator.port";
import { RequestHeaders } from "@/api/platform/http/auth/auth.types";
import {
  RealtimeBroadcaster,
  RealtimeTarget,
  roomOf,
} from "@/api/platform/realtime/realtime-broadcaster";
import { WS_GATEWAY_OPTIONS } from "@/api/platform/realtime/ws-gateway.options";

/**
 * Socket.io transport: authenticates on connect, joins the user/guest room and emits
 * for every context. Inbound commands live in each context's own gateway.
 */
@WebSocketGateway(WS_GATEWAY_OPTIONS)
export class WsGateway
  extends RealtimeBroadcaster
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new ContextLogger(WsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly actorAuthenticator: ActorAuthenticator) {
    super();
  }

  emit(targets: RealtimeTarget[], event: string, payload: unknown): void {
    this.server.to(targets.map(roomOf)).emit(event, payload);
  }

  /**
   * Overridden method from OnGatewayConnection to handle new socket connections. Authenticates the socket and assigns the identity to socket.data.identity. Joins the user or guest room based on the identity.
   * @param socket
   * @returns
   */
  async handleConnection(socket: Socket): Promise<void> {
    const identity = await this.actorAuthenticator.authenticate(
      this.handshakeHeaders(socket),
    );

    if (!identity) {
      socket.emit("error", { code: "unauthorized", message: "auth failed" });
      socket.disconnect(true);
      return;
    }

    socket.data.identity = identity;

    if (identity.kind === "user") {
      await socket.join(roomOf({ kind: "user", id: identity.userId }));
    } else {
      await socket.join(roomOf({ kind: "guest", id: identity.guestId }));
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

  /** Handshake headers, with `auth.token` promoted to a bearer header when none is set. */
  private handshakeHeaders(socket: Socket): RequestHeaders {
    const headers: RequestHeaders = { ...socket.handshake.headers };
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token === "string" && !headers.authorization) {
      headers.authorization = `Bearer ${token}`;
    }
    return headers;
  }
}
