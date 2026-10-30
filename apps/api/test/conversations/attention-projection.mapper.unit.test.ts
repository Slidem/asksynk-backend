import {
  fromMessageEvent,
  fromMessageStatusChanged,
} from "@/api/conversations/application/attention-projection.mapper";

const message = (tagIds: string[] | undefined) => ({
  id: "m1",
  threadId: "th1",
  parentMessageId: null,
  senderKind: "user" as const,
  senderId: "sender",
  body: "Can you review this?",
  tagIds,
  managedStatus: tagIds?.length
    ? { type: "tagged_message" as const, status: "created" as const }
    : undefined,
  createdAt: "2026-01-01T10:00:00.000Z",
});

const source = { context: "conversations", kind: "message", id: "m1" };

describe("conversations attention projection mapper", () => {
  it("projects a tagged message onto the recipient", () => {
    expect(
      fromMessageEvent(
        { threadId: "th1", message: message(["tag-a"]), sentToUserId: "rcpt" },
        false,
      ),
    ).toEqual({
      kind: "upserted",
      payload: {
        userId: "rcpt",
        source,
        preview: {
          title: "Can you review this?",
          body: "Can you review this?",
          actor: { kind: "user", id: "sender" },
          meta: { threadId: "th1" },
        },
        tagIds: ["tag-a"],
        status: "created",
        dueDate: null,
        occurredAt: "2026-01-01T10:00:00.000Z",
      },
    });
  });

  it("skips untagged creates, guests and the sender", () => {
    const untagged = { threadId: "th1", message: message([]) };
    expect(fromMessageEvent({ ...untagged, sentToUserId: "rcpt" }, false)).toBeNull();

    const tagged = { threadId: "th1", message: message(["tag-a"]) };
    expect(fromMessageEvent({ ...tagged, sentToGuestId: "g1" }, false)).toBeNull();
    expect(fromMessageEvent({ ...tagged, sentToUserId: "sender" }, false)).toBeNull();
  });

  it("removes the item when an update untags the message", () => {
    expect(
      fromMessageEvent(
        { threadId: "th1", message: message([]), sentToUserId: "rcpt" },
        true,
      ),
    ).toEqual({ kind: "removed", payload: { userId: "rcpt", source } });
  });

  it("ignores an update that says nothing about tags", () => {
    expect(
      fromMessageEvent(
        { threadId: "th1", message: message(undefined), sentToUserId: "rcpt" },
        true,
      ),
    ).toBeNull();
  });

  it("follows the managed status set by the recipient", () => {
    const upserted = fromMessageStatusChanged({
      userId: "rcpt",
      threadId: "th1",
      messageId: "m1",
      managedStatus: { type: "tagged_message", status: "resolved" },
      message: message(["tag-a"]),
    });
    expect(upserted).toMatchObject({ userId: "rcpt", source, status: "resolved" });
  });
});
