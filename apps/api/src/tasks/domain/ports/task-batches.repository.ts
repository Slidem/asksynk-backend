import { TaskBatch } from "@/api/tasks/entities/task-batch.entity";

export abstract class TaskBatchesRepository {
  abstract add(
    id: string,
    input: {
      createdBy: string;
      assigneeUserId: string;
      title: string;
      dueDate: Date | null;
      tagIds: string[];
    },
  ): Promise<TaskBatch>;
  abstract getById(id: string): Promise<TaskBatch | null>;
  abstract update(batch: TaskBatch): Promise<TaskBatch>;
  abstract softDelete(id: string): Promise<void>;
}
