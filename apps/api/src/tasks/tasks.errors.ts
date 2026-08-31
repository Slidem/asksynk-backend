import { DomainErrorCategory } from "@/api/kernel/errors/domain-errors";
import { defineCatalog } from "@/api/kernel/errors/error-catalog";

const { catalog, createError } = defineCatalog("tasks", {
  task_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Task with id { taskId } not found",
  },
  task_batch_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Task batch with id { batchId } not found",
  },
  task_suggestion_not_found: {
    category: DomainErrorCategory.NOT_FOUND,
    exposable: true,
    message: "Task suggestion with id { suggestionId } not found",
  },
  not_task_assignee: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Only the assignee can { action } this task",
  },
  not_batch_assignee: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Only the assignee can modify this batch",
  },
  batch_fields_managed_at_batch_level: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "Tags and due date are managed at batch level",
  },
  batch_requires_tasks: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "A batch needs at least one task",
  },
  cannot_suggest_to_self: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "Cannot suggest a task to yourself",
  },
  tasks_only_on_batch_suggestion: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "Only batch suggestions can have tasks",
  },
  cannot_act_on_suggestion: {
    category: DomainErrorCategory.FORBIDDEN,
    exposable: true,
    message: "Not allowed to act on suggestion { suggestionId }",
  },
  suggestion_not_pending: {
    category: DomainErrorCategory.CONFLICT,
    exposable: true,
    message: "Suggestion { suggestionId } is not pending",
  },
  invalid_suggestion_update: {
    category: DomainErrorCategory.INVALID_VALUE,
    exposable: true,
    message: "Invalid suggestion update; reason: { reason }",
  },
});

export const tasksCatalog = catalog;
export const tasksError = createError;
