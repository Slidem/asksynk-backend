import { AttentionItemStatus } from "@/api/attention/contract/attention-item-status.public";
import { mapTaskStatusToAttention } from "@/api/tasks/application/task-status.util";
import { TaskStatus } from "@/api/tasks/domain/task.model";

describe("Map task status to attention", () => {
  it.each<[TaskStatus, AttentionItemStatus]>([
    ["completed", "resolved"],
    ["in_progress", "in_progress"],
    ["todo", "created"],
  ])("maps task status %s to attention %s", (status, expected) => {
    expect(mapTaskStatusToAttention(status as TaskStatus)).toBe(expected);
  });
});
