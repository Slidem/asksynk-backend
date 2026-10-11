import { TaskSuggestionPayload } from "@/api/tasks/contract/task-suggestion.port";
import {
  TaskStatus,
  TaskSuggestionStatus,
} from "@/api/tasks/domain/task.model";
import { TaskSuggestion } from "@/api/tasks/domain/task-suggestion";

export type MaterializedTaskView = {
  id: string;
  title: string;
  status: TaskStatus;
};

// Wire shape of a suggestion: the REST response and the TaskSuggestionBroadcast
// payload. Built here so publishing (application) never reaches into presentation.
export type TaskSuggestionView = {
  id: string;
  suggesterUserId: string;
  suggesteeUserId: string;
  status: TaskSuggestionStatus;
  payload: TaskSuggestionPayload;
  materializedTasks: MaterializedTaskView[];
  createdAt: string;
  updatedAt: string;
};

export function toTaskSuggestionView(
  suggestion: TaskSuggestion,
  materializedTasks: MaterializedTaskView[] = [],
): TaskSuggestionView {
  return {
    id: suggestion.id,
    suggesterUserId: suggestion.suggesterUserId,
    suggesteeUserId: suggestion.suggesteeUserId,
    status: suggestion.status,
    payload: suggestion.payload,
    materializedTasks,
    createdAt: suggestion.createdAt.toISOString(),
    updatedAt: suggestion.updatedAt.toISOString(),
  };
}
