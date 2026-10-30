import { AttentionItem } from "@/api/attention/domain/attention-item";
import {
  applySnapshot,
  AttentionSourceSnapshot,
} from "@/api/attention/domain/attention-projection";
import { DueDateDecision } from "@/api/attention/domain/due-date.policy";

const occurredAt = new Date("2026-01-01T10:00:00Z");
const policyDate = new Date("2026-01-01T11:00:00Z");
const explicitDate = new Date("2026-02-01T09:00:00Z");

const snapshot = (
  overrides: Partial<AttentionSourceSnapshot> = {},
): AttentionSourceSnapshot => ({
  userId: "u1",
  source: { context: "tasks", kind: "task", id: "t1" },
  preview: { title: "Write report", body: null, actor: null, meta: {} },
  tagIds: ["tag-a", "tag-b"],
  status: "created",
  dueDate: null,
  occurredAt,
  ...overrides,
});

const decision: DueDateDecision = {
  dueDate: policyDate,
  dueSourceEventId: "evt-1",
};

const itemFrom = (
  s: AttentionSourceSnapshot,
  overrides: Partial<Parameters<typeof AttentionItem.create>[0]> = {},
): AttentionItem =>
  AttentionItem.create({
    id: "i1",
    userId: s.userId,
    source: s.source,
    preview: s.preview,
    status: s.status,
    tagIds: s.tagIds,
    dueDate: policyDate,
    dueDatePinned: false,
    dueSourceEventId: "evt-1",
    deletedAt: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    ...overrides,
  });

describe("applySnapshot", () => {
  it("creates a new item with the policy's due date", () => {
    expect(applySnapshot(null, snapshot(), decision)).toEqual({
      userId: "u1",
      source: { context: "tasks", kind: "task", id: "t1" },
      preview: { title: "Write report", body: null, actor: null, meta: {} },
      tagIds: ["tag-a", "tag-b"],
      status: "created",
      dueDate: policyDate,
      dueDatePinned: false,
      dueSourceEventId: "evt-1",
    });
  });

  it("is a no-op on a tombstoned item", () => {
    const s = snapshot({ status: "resolved" });
    const current = itemFrom(snapshot(), { deletedAt: new Date() });
    expect(applySnapshot(current, s, decision)).toBeNull();
  });

  it("pins an explicit due date and ignores the policy", () => {
    const next = applySnapshot(
      null,
      snapshot({ dueDate: explicitDate }),
      decision,
    );
    expect(next).toMatchObject({
      dueDate: explicitDate,
      dueDatePinned: true,
      dueSourceEventId: null,
    });
  });

  it("unpins when the explicit date is cleared", () => {
    const current = itemFrom(snapshot(), {
      dueDate: explicitDate,
      dueDatePinned: true,
      dueSourceEventId: null,
    });
    expect(applySnapshot(current, snapshot(), decision)).toMatchObject({
      dueDate: policyDate,
      dueDatePinned: false,
      dueSourceEventId: "evt-1",
    });
  });

  it("returns null when nothing differs (tag order ignored)", () => {
    const s = snapshot();
    const current = itemFrom(s);
    expect(
      applySnapshot(current, { ...s, tagIds: ["tag-b", "tag-a"] }, decision),
    ).toBeNull();
  });

  it.each<[string, Partial<AttentionSourceSnapshot>]>([
    ["status", { status: "in_progress" }],
    ["tags", { tagIds: ["tag-a"] }],
    [
      "preview",
      {
        preview: { title: "Renamed", body: null, actor: null, meta: {} },
      },
    ],
    [
      "preview meta",
      {
        preview: {
          title: "Write report",
          body: null,
          actor: null,
          meta: { threadId: "th1" },
        },
      },
    ],
  ])("returns the next state when %s changes", (_, overrides) => {
    const current = itemFrom(snapshot());
    expect(
      applySnapshot(current, snapshot(overrides), decision),
    ).not.toBeNull();
  });

  it("returns the next state when the policy's date moves", () => {
    const current = itemFrom(snapshot());
    const moved = { dueDate: explicitDate, dueSourceEventId: "evt-2" };
    expect(applySnapshot(current, snapshot(), moved)).toMatchObject(moved);
  });
});
