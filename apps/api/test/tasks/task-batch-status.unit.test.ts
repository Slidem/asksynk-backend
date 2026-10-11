import { TaskStatus } from "@/api/tasks/domain/task.model";
import { deriveBatchStatus } from "@/api/tasks/domain/task-batch-status";

describe("Derive batch status", () => {
  it.each<[TaskStatus[], TaskStatus]>([
    [[], "todo"],
    [["todo"], "todo"],
    [["todo", "todo"], "todo"],
    [["completed"], "completed"],
    [["completed", "completed"], "completed"],
    [["todo", "completed"], "in_progress"],
    [["in_progress", "completed"], "in_progress"],
    [["todo", "in_progress"], "in_progress"],
    [["todo", "in_progress", "completed"], "in_progress"],
  ])("derives task statuses %s to %s", (statuses, expected) => {
    expect(deriveBatchStatus(statuses)).toBe(expected);
  });
});
