import { AttentionItemStatus } from "@/api/attention/contract/attention-item-status.public";
import {
  AttentionSourceRemoved,
  AttentionSourceUpserted,
  TaskBatchUpserted,
  TaskSuggested,
  TaskUpserted,
} from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";
import { TaskStatus } from "@/api/tasks/domain/task.model";

// Tasks' outbound ACL onto attention's ingestion contract. Pure: each source
// event becomes one upsert or removal for its single target user.

type Upserted = EventOf<typeof AttentionSourceUpserted>;
type Removed = EventOf<typeof AttentionSourceRemoved>;
export type AttentionProjection =
  | { kind: "upserted"; payload: Upserted }
  | { kind: "removed"; payload: Removed };

const CONTEXT = "tasks";

export function mapTaskStatusToAttention(
  status: TaskStatus,
): AttentionItemStatus {
  if (status === "completed") return "resolved";
  if (status === "in_progress") return "in_progress";
  return "created";
}

export function taskSource(taskId: string): Upserted["source"] {
  return { context: CONTEXT, kind: "task", id: taskId };
}

export function taskBatchSource(taskBatchId: string): Upserted["source"] {
  return { context: CONTEXT, kind: "task_batch", id: taskBatchId };
}

export function taskSuggestionSource(suggestionId: string): Upserted["source"] {
  return { context: CONTEXT, kind: "task_suggestion", id: suggestionId };
}

/** Tagged → upsert for the assignee; untagged → removal. */
export function fromTask(p: EventOf<typeof TaskUpserted>): AttentionProjection {
  return fromTaggedSource(taskSource(p.taskId), p.assigneeUserId, {
    title: p.title,
    status: p.status,
    tagIds: p.tagIds,
    dueDate: p.dueDate,
    createdAt: p.createdAt,
  });
}

export function fromTaskBatch(
  p: EventOf<typeof TaskBatchUpserted>,
): AttentionProjection {
  return fromTaggedSource(taskBatchSource(p.taskBatchId), p.assigneeUserId, {
    title: p.title,
    status: p.aggregateStatus,
    tagIds: p.tagIds,
    dueDate: p.dueDate,
    createdAt: p.createdAt,
  });
}

/** Untagged inbox item for the suggestee: pending → created, else resolved. */
export function fromTaskSuggestion(p: EventOf<typeof TaskSuggested>): Upserted {
  return {
    userId: p.suggesteeUserId,
    source: taskSuggestionSource(p.suggestionId),
    preview: {
      title: p.title,
      body: null,
      actor: { kind: "user", id: p.suggesterUserId },
      meta: {},
    },
    tagIds: [],
    status: p.status === "pending" ? "created" : "resolved",
    dueDate: p.dueDate,
    occurredAt: p.createdAt,
  };
}

function fromTaggedSource(
  source: Upserted["source"],
  userId: string,
  s: {
    title: string;
    status: TaskStatus;
    tagIds: string[];
    dueDate: string | null;
    createdAt: string;
  },
): AttentionProjection {
  if (s.tagIds.length === 0) {
    return { kind: "removed", payload: { userId, source } };
  }
  return {
    kind: "upserted",
    payload: {
      userId,
      source,
      preview: { title: s.title, body: null, actor: null, meta: {} },
      tagIds: s.tagIds,
      status: mapTaskStatusToAttention(s.status),
      dueDate: s.dueDate,
      occurredAt: s.createdAt,
    },
  };
}
