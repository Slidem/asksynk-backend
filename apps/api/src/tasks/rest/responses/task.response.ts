import { TaskStatus } from "@/api/tasks/models/task.model";

export interface TaskResponse {
  id: string;
  batchId: string | null;
  createdBy: string;
  assigneeUserId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}
