import {
  fromTask,
  fromTaskBatch,
  fromTaskSuggestion,
  mapTaskStatusToAttention,
} from "@/api/tasks/application/attention-projection.mapper";

const createdAt = "2026-01-01T10:00:00.000Z";

describe("tasks attention projection mapper", () => {
  it.each([
    ["todo", "created"],
    ["in_progress", "in_progress"],
    ["completed", "resolved"],
  ] as const)("maps task status %s → %s", (task, attention) => {
    expect(mapTaskStatusToAttention(task)).toBe(attention);
  });

  it("projects a tagged task onto its assignee", () => {
    expect(
      fromTask({
        taskId: "t1",
        assigneeUserId: "u1",
        title: "Write report",
        status: "in_progress",
        tagIds: ["tag-a"],
        dueDate: "2026-02-01T09:00:00.000Z",
        createdAt,
      }),
    ).toEqual({
      kind: "upserted",
      payload: {
        userId: "u1",
        source: { context: "tasks", kind: "task", id: "t1" },
        preview: { title: "Write report", body: null, actor: null, meta: {} },
        tagIds: ["tag-a"],
        status: "in_progress",
        dueDate: "2026-02-01T09:00:00.000Z",
        occurredAt: createdAt,
      },
    });
  });

  it("removes an untagged task's item", () => {
    expect(
      fromTask({
        taskId: "t1",
        assigneeUserId: "u1",
        title: "Write report",
        status: "todo",
        tagIds: [],
        dueDate: null,
        createdAt,
      }),
    ).toEqual({
      kind: "removed",
      payload: {
        userId: "u1",
        source: { context: "tasks", kind: "task", id: "t1" },
      },
    });
  });

  it("projects a batch with its aggregate status", () => {
    const projection = fromTaskBatch({
      taskBatchId: "b1",
      assigneeUserId: "u1",
      title: "Launch",
      aggregateStatus: "completed",
      tagIds: ["tag-a"],
      dueDate: null,
      createdAt,
    });
    expect(projection).toMatchObject({
      kind: "upserted",
      payload: {
        source: { context: "tasks", kind: "task_batch", id: "b1" },
        status: "resolved",
      },
    });
  });

  it.each([
    ["pending", "created"],
    ["accepted", "resolved"],
    ["rejected", "resolved"],
  ] as const)(
    "projects a %s suggestion onto the suggestee as %s",
    (status, attention) => {
      expect(
        fromTaskSuggestion({
          suggestionId: "s1",
          suggesteeUserId: "u1",
          suggesterUserId: "u2",
          status,
          title: "Review PR",
          dueDate: null,
          createdAt,
        }),
      ).toEqual({
        userId: "u1",
        source: { context: "tasks", kind: "task_suggestion", id: "s1" },
        preview: {
          title: "Review PR",
          body: null,
          actor: { kind: "user", id: "u2" },
          meta: {},
        },
        tagIds: [],
        status: attention,
        dueDate: null,
        occurredAt: createdAt,
      });
    },
  );
});
