import "reflect-metadata";

import { MessagingBroadcaster } from "@/api/conversations/presentation/ws/messaging.broadcaster";
import {
  AttachmentCatalogPort,
  ReadableAttachment,
} from "@/api/files/contract/attachment-catalog.port";
import { MessageCreated } from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";
import { RealtimeBroadcaster } from "@/api/platform/realtime/realtime-broadcaster";

const attachment: ReadableAttachment = {
  id: "a1",
  contentType: "image/png",
  fileName: "x.png",
  sizeBytes: 10,
  url: "https://signed/a1",
  expiresAt: new Date("2026-01-01T00:00:00.000Z"),
};

const created = (
  over: Partial<EventOf<typeof MessageCreated>> = {},
): EventOf<typeof MessageCreated> => ({
  threadId: "t1",
  message: {
    id: "m1",
    threadId: "t1",
    parentMessageId: null,
    senderKind: "user",
    senderId: "u1",
    body: "hi",
    attachmentIds: ["a1"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  ...over,
});

describe("MessagingBroadcaster", () => {
  let emit: jest.Mock;
  let resolveMany: jest.Mock;
  let broadcaster: MessagingBroadcaster;

  beforeEach(() => {
    emit = jest.fn();
    resolveMany = jest.fn().mockResolvedValue([attachment]);
    broadcaster = new MessagingBroadcaster(
      { emit } as unknown as RealtimeBroadcaster,
      { resolveMany } as unknown as AttachmentCatalogPort,
    );
  });

  it("message.created → thread + recipient user in one emit, attachments resolved", async () => {
    await broadcaster.onMessageCreated(created({ sentToUserId: "u2" }));

    expect(resolveMany).toHaveBeenCalledWith(["a1"]);
    expect(emit).toHaveBeenCalledTimes(1);
    const [targets, event, payload] = emit.mock.calls[0];
    expect(targets).toEqual([
      { kind: "thread", id: "t1" },
      { kind: "user", id: "u2" },
    ]);
    expect(event).toBe("message.created");
    expect(payload.message).toMatchObject({
      id: "m1",
      tagIds: [],
      suggestionId: null,
      attachments: [
        {
          id: "a1",
          url: "https://signed/a1",
          expiresAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
  });

  it("message.created → guest recipient targets the guest room", async () => {
    await broadcaster.onMessageCreated(created({ sentToGuestId: "g1" }));

    expect(emit.mock.calls[0][0]).toEqual([
      { kind: "thread", id: "t1" },
      { kind: "guest", id: "g1" },
    ]);
  });

  it("message.status.updated → thread only", async () => {
    await broadcaster.onMessageManagedStatusChanged({
      userId: "u1",
      threadId: "t1",
      messageId: "m1",
      managedStatus: { type: "tagged_message", status: "resolved" },
    });

    expect(emit).toHaveBeenCalledWith(
      [{ kind: "thread", id: "t1" }],
      "message.status.updated",
      {
        threadId: "t1",
        messageId: "m1",
        managedStatus: { type: "tagged_message", status: "resolved" },
      },
    );
  });
});
