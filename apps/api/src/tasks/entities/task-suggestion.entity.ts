import {
  TaskSuggestionPayload,
  TaskSuggestionStatus,
} from "@/api/tasks/models/task.model";

export interface TaskSuggestionProps {
  id: string;
  suggesterUserId: string;
  suggesteeUserId: string;
  status: TaskSuggestionStatus;
  payload: TaskSuggestionPayload;
  createdAt: Date;
  updatedAt: Date;
}

export class TaskSuggestion {
  readonly id: string;
  readonly suggesterUserId: string;
  readonly suggesteeUserId: string;
  status: TaskSuggestionStatus;
  readonly payload: TaskSuggestionPayload;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: TaskSuggestionProps) {
    this.id = props.id;
    this.suggesterUserId = props.suggesterUserId;
    this.suggesteeUserId = props.suggesteeUserId;
    this.status = props.status;
    this.payload = props.payload;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: TaskSuggestionProps): TaskSuggestion {
    return new TaskSuggestion(props);
  }

  isPending(): boolean {
    return this.status === "pending";
  }

  isSuggestee(userId: string): boolean {
    return this.suggesteeUserId === userId;
  }

  isSuggester(userId: string): boolean {
    return this.suggesterUserId === userId;
  }
}
