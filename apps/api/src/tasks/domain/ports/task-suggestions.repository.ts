import { TaskSuggestionPayload } from "@/api/tasks/contract/task-suggestion.port";
import { CreateTaskSuggestionInput, TaskSuggestionStatus } from "@/api/tasks/domain/task.model";
import { TaskSuggestion } from "@/api/tasks/domain/task-suggestion";

export abstract class TaskSuggestionsRepository {
  abstract add(
    id: string,
    input: CreateTaskSuggestionInput,
  ): Promise<TaskSuggestion>;
  abstract getById(id: string): Promise<TaskSuggestion | null>;
  abstract findByMaterializedTaskId(
    taskId: string,
  ): Promise<TaskSuggestion | null>;
  abstract findByMaterializedBatchId(
    batchId: string,
  ): Promise<TaskSuggestion | null>;
  abstract updateStatus(
    id: string,
    status: TaskSuggestionStatus,
  ): Promise<TaskSuggestion | null>;
  abstract markAccepted(
    id: string,
    link: { materializedTaskId?: string; materializedBatchId?: string },
  ): Promise<TaskSuggestion | null>;
  abstract updatePayload(
    id: string,
    payload: TaskSuggestionPayload,
  ): Promise<TaskSuggestion | null>;
  abstract listForSuggester(
    suggesterUserId: string,
    status?: TaskSuggestionStatus,
  ): Promise<TaskSuggestion[]>;
  abstract listForSuggestee(
    suggesteeUserId: string,
    status?: TaskSuggestionStatus,
  ): Promise<TaskSuggestion[]>;
}
