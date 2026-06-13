import {
  TaskSuggestionPayload,
  TaskSuggestionStatus,
} from "@/api/tasks/models/task.model";

export interface TaskSuggestionResponse {
  id: string;
  suggesterUserId: string;
  suggesteeUserId: string;
  status: TaskSuggestionStatus;
  payload: TaskSuggestionPayload;
  createdAt: string;
  updatedAt: string;
}
