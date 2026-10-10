import { AttentionItemStatus } from "@/api/attention-items/models/attention-item.model";
import { TaskStatus } from "@/api/tasks/models/task.model";
import {
  aggregateBatchStatus,
  mapTaskStatusToAttention,
} from "@/api/tasks/task-status.util";

describe("Map task status to attention", () => {
  it.each<[TaskStatus, AttentionItemStatus]>([
    ["completed", "resolved"],
    ["in_progress", "in_progress"],
    ["todo", "created"],
  ])("maps task status %s to attention %s", (status, expected) => {
    expect(mapTaskStatusToAttention(status as TaskStatus)).toBe(expected);
  });
});

describe("Aggregate batch status", () => {
  it.each<[TaskStatus[], AttentionItemStatus]>([
    [[], "created"],
    [["todo"], "created"],
    [["todo", "todo"], "created"],
    [["completed"], "resolved"],
    [["completed", "completed"], "resolved"],
    [["todo", "completed"], "in_progress"],
    [["in_progress", "completed"], "in_progress"],
    [["todo", "in_progress"], "in_progress"],
    [["todo", "in_progress", "completed"], "in_progress"],
  ])("aggregates task statuses %s to %s", (statuses, expected) => {
    expect(aggregateBatchStatus(statuses as TaskStatus[])).toBe(expected);
  });
});
