export interface TaskBatchProps {
  id: string;
  createdBy: string;
  assigneeUserId: string;
  title: string;
  dueDate: Date | null;
  tagIds: string[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TaskBatch {
  readonly id: string;
  readonly createdBy: string;
  readonly assigneeUserId: string;
  title: string;
  dueDate: Date | null;
  tagIds: string[];
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: TaskBatchProps) {
    this.id = props.id;
    this.createdBy = props.createdBy;
    this.assigneeUserId = props.assigneeUserId;
    this.title = props.title;
    this.dueDate = props.dueDate;
    this.tagIds = props.tagIds;
    this.deletedAt = props.deletedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: TaskBatchProps): TaskBatch {
    return new TaskBatch(props);
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  // Visible to its creator and to its assignee.
  isVisibleTo(userId: string): boolean {
    return this.createdBy === userId || this.assigneeUserId === userId;
  }

  // The assignee owns the batch: edits everything + deletes.
  isAssignee(userId: string): boolean {
    return this.assigneeUserId === userId;
  }
}
