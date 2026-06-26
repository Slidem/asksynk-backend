import {
  TaskStatus,
  TaskSuggestionPayload,
  TaskSuggestionStatus,
} from "@/api/tasks/models/task.model";

export interface MaterializedTask {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface TaskSuggestionResponse {
  id: string;
  suggesterUserId: string;
  suggesteeUserId: string;
  status: TaskSuggestionStatus;
  payload: TaskSuggestionPayload;
  // The real tasks created on accept. Populated on GET :id + the suggestion
  // broadcast; empty elsewhere (and while pending/rejected).
  materializedTasks: MaterializedTask[];
  createdAt: string;
  updatedAt: string;
}
