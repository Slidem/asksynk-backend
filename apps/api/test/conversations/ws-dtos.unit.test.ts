import "reflect-metadata";

import { Type } from "@nestjs/common";
import { WsParamtype } from "@nestjs/websockets/enums/ws-paramtype.enum";
import { defer, lastValueFrom, map } from "rxjs";

import { MAX_ATTACHMENTS_PER_MESSAGE } from "@/api/conversations/domain/message-attachment.constants";
import { SendMessageDto } from "@/api/conversations/presentation/ws/dto/send-message.dto";
import { TagMessageDto } from "@/api/conversations/presentation/ws/dto/tag-message.dto";
import { ThreadSubscriptionDto } from "@/api/conversations/presentation/ws/dto/thread-subscription.dto";
import { UpdateMessageStatusDto } from "@/api/conversations/presentation/ws/dto/update-message-status.dto";
import { DomainErrorsTranslator } from "@/api/platform/errors/errors.translator";
import { WsAckInterceptor } from "@/api/platform/realtime/ws-ack.interceptor";
import { WsPayloadValidationPipe } from "@/api/platform/realtime/ws-command.decorator";

jest.mock("nestjs-context-logger", () => ({
  ContextLogger: jest.fn().mockImplementation(() => ({ error: jest.fn() })),
}));

/**
 * Invalid payloads must produce the exact ack strings the old hand-rolled gateway
 * checks returned (clients match on them). Runs the real pipe + ack interceptor.
 */
const pipe = new WsPayloadValidationPipe();
const interceptor = new WsAckInterceptor(new DomainErrorsTranslator([]));

function ackFor(dto: Type, payload: unknown): Promise<unknown> {
  const handler = {
    handle: () =>
      defer(() =>
        pipe.transform(payload, {
          type: WsParamtype.PAYLOAD as never,
          metatype: dto,
        }),
      ).pipe(map(() => ({ ok: true }))),
  };
  return lastValueFrom(interceptor.intercept({} as never, handler));
}

const fail = (error: string) => ({ ok: false, error });
const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

describe("WS command payloads → old ack strings", () => {
  it.each<[string, Type, unknown, string]>([
    ["subscribe: no threadId", ThreadSubscriptionDto, {}, "threadId required"],
    [
      "subscribe: no payload",
      ThreadSubscriptionDto,
      undefined,
      "threadId required",
    ],
    ["send: no body", SendMessageDto, {}, "body required"],
    ["send: no payload", SendMessageDto, undefined, "body required"],
    ["send: blank body", SendMessageDto, { body: "   " }, "body required"],
    [
      "send: body before tagIds",
      SendMessageDto,
      { tagIds: "x" },
      "body required",
    ],
    [
      "send: tagIds not array",
      SendMessageDto,
      { body: "b", tagIds: "x" },
      "tagIds must be string[]",
    ],
    [
      "send: tagIds not strings",
      SendMessageDto,
      { body: "b", tagIds: [1] },
      "tagIds must be string[]",
    ],
    [
      "send: attachmentIds not strings",
      SendMessageDto,
      { body: "b", attachmentIds: [1] },
      "attachmentIds must be string[]",
    ],
    [
      "send: attachmentIds not array",
      SendMessageDto,
      { body: "b", attachmentIds: "x" },
      "attachmentIds must be string[]",
    ],
    [
      "send: too many attachments",
      SendMessageDto,
      { body: "b", attachmentIds: ids(MAX_ATTACHMENTS_PER_MESSAGE + 1) },
      `maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments allowed`,
    ],
    [
      "send: suggestion kind",
      SendMessageDto,
      { body: "b", taskSuggestion: { kind: "x", title: "t" } },
      "taskSuggestion.kind must be task|batch",
    ],
    [
      "send: suggestion title",
      SendMessageDto,
      { body: "b", taskSuggestion: { kind: "task", title: "  " } },
      "taskSuggestion.title required",
    ],
    ["tag: no messageId", TagMessageDto, {}, "messageId required"],
    [
      "tag: tagIds not strings",
      TagMessageDto,
      { messageId: "m", tagIds: [1] },
      "tagIds must be string[]",
    ],
    [
      "status: no messageId",
      UpdateMessageStatusDto,
      { status: "resolved" },
      "messageId required",
    ],
    [
      "status: bad status",
      UpdateMessageStatusDto,
      { messageId: "m", status: "x" },
      "status must be one of created, in_progress, resolved",
    ],
  ])("%s", async (_, dto, payload, error) => {
    expect(await ackFor(dto, payload)).toEqual(fail(error));
  });

  it("valid send: body trimmed, id lists deduped, max attachments ok", async () => {
    const dto = (await pipe.transform(
      {
        body: "  hi  ",
        tagIds: ["a", "a", "b"],
        attachmentIds: ids(MAX_ATTACHMENTS_PER_MESSAGE),
        taskSuggestion: null,
      },
      { type: WsParamtype.PAYLOAD as never, metatype: SendMessageDto },
    )) as SendMessageDto;

    expect(dto.body).toBe("hi");
    expect(dto.tagIds).toEqual(["a", "b"]);
    expect(dto.attachmentIds).toHaveLength(MAX_ATTACHMENTS_PER_MESSAGE);
  });

  it("non-payload params (the socket) pass through untouched", async () => {
    const socket = { id: "s1" };
    expect(
      await pipe.transform(socket, {
        type: WsParamtype.SOCKET as never,
        metatype: Object,
      }),
    ).toBe(socket);
  });
});
