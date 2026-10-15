import { TaskSuggestionPayload } from "@/api/tasks/contract/task-suggestion.port";

export interface SendMessageInput {
  /** Required for users; ignored for guests (their thread is derived). */
  threadId: string | null;
  body: string;
  tagIds: string[];
  parentMessageId: string | null;
  attachmentIds: string[];
  taskSuggestion: TaskSuggestionPayload | null;
}
