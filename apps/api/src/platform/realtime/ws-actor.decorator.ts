import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { Socket } from "socket.io";

import { Actor } from "@/api/kernel/actor/actor";

/**
 * The socket's authenticated Actor (set on connect). Missing → "unauthorized" ack: Nest
 * doesn't await handleConnection, so a command can race the auth. A param decorator,
 * not a guard: guards run outside interceptors, so their errors would skip the ack.
 */
export const WsActor = createParamDecorator(
  (_: unknown, context: ExecutionContext): Actor => {
    const identity = context.switchToWs().getClient<Socket>().data.identity as
      | Actor
      | undefined;
    if (!identity) {
      throw new WsException("unauthorized");
    }
    return identity;
  },
);
