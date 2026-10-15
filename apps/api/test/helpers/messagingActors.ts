import { SendMessageInput } from "@/api/conversations/application/send-message.model";
import { Actor } from "@/api/kernel/actor/actor";
import { TaskSuggestionPayload } from "@/api/tasks/contract/task-suggestion.port";

export const userActorOf = (userId: string): Actor => ({
  kind: "user",
  userId,
  email: `${userId}@test.example`,
});

export function sendInput(
  threadId: string | null,
  body: string,
  tagIds: string[] = [],
  parentMessageId: string | null = null,
  attachmentIds: string[] = [],
  taskSuggestion: TaskSuggestionPayload | null = null,
): SendMessageInput {
  return {
    threadId,
    body,
    tagIds,
    parentMessageId,
    attachmentIds,
    taskSuggestion,
  };
}
