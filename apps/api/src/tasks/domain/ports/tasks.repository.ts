import { Task } from "@/api/tasks/domain/task";
import {
  CreateTaskInput,
  ListTasksInput,
  TaskStatus,
} from "@/api/tasks/domain/task.model";

export abstract class TasksRepository {
  abstract add(id: string, input: CreateTaskInput): Promise<Task>;
  abstract getById(id: string): Promise<Task | null>;
  abstract listByScope(userId: string, input: ListTasksInput): Promise<Task[]>;
  abstract listByBatchId(batchId: string): Promise<Task[]>;
  abstract update(task: Task): Promise<Task>;
  abstract softDelete(id: string): Promise<void>;
  abstract softDeleteByBatchId(batchId: string): Promise<void>;
  abstract listStatusesByBatchId(batchId: string): Promise<TaskStatus[]>;
}
