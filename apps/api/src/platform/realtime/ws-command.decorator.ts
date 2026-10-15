import {
  applyDecorators,
  ArgumentMetadata,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { SubscribeMessage } from "@nestjs/websockets";
import { WsParamtype } from "@nestjs/websockets/enums/ws-paramtype.enum";

import { WsAckInterceptor } from "@/api/platform/realtime/ws-ack.interceptor";

/** Same validation as HTTP, applied to the message payload only (not the socket). */
export class WsPayloadValidationPipe extends ValidationPipe {
  constructor() {
    super({ whitelist: true, transform: true });
  }

  override async transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    if ((metadata.type as unknown) !== WsParamtype.PAYLOAD) {
      return value;
    }
    return super.transform(value ?? {}, metadata);
  }
}

/** A WS command: validated payload, errors returned as `{ ok: false, error }` acks. */
export const WsCommand = (event: string) =>
  applyDecorators(
    SubscribeMessage(event),
    UsePipes(new WsPayloadValidationPipe()),
    UseInterceptors(WsAckInterceptor),
  );
