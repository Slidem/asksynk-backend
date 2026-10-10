import { AttentionItemStatus } from "@/api/attention-items/models/attention-item.model";
import { TaskStatus } from "@/api/tasks/models/task.model";
import { mapTaskStatusToAttention } from "@/api/tasks/task-status.util";

describe("Map task status to attention", () => {
  it.each<[TaskStatus, AttentionItemStatus]>([
    ["completed", "resolved"],
    ["in_progress", "in_progress"],
    ["todo", "created"],
  ])("maps task status %s to attention %s", (status, expected) => {
    expect(mapTaskStatusToAttention(status as TaskStatus)).toBe(expected);
  });
});
