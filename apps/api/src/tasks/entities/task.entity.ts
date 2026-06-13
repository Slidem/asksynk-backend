import { TaskStatus } from "@/api/tasks/models/task.model";

export interface TaskProps {
  id: string;
  batchId: string | null;
  createdBy: string;
  assigneeUserId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: Date | null;
  tagIds: string[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Task {
  readonly id: string;
  readonly batchId: string | null;
  readonly createdBy: string;
  readonly assigneeUserId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: Date | null;
  tagIds: string[];
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: TaskProps) {
    this.id = props.id;
    this.batchId = props.batchId;
    this.createdBy = props.createdBy;
    this.assigneeUserId = props.assigneeUserId;
    this.title = props.title;
    this.description = props.description;
    this.status = props.status;
    this.dueDate = props.dueDate;
    this.tagIds = props.tagIds;
    this.deletedAt = props.deletedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: TaskProps): Task {
    return new Task(props);
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  // Visible to its creator and to its assignee.
  isVisibleTo(userId: string): boolean {
    return this.createdBy === userId || this.assigneeUserId === userId;
  }

  // The assignee owns the task: edits everything + deletes.
  isAssignee(userId: string): boolean {
    return this.assigneeUserId === userId;
  }
}
