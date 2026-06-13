import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
} from "@nestjs/common";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { UuidV7Param } from "@/api/common/decorators/param.decorators";
import { CreateTaskBatchRequestDto } from "@/api/tasks/rest/dto/create-task-batch.dto";
import { PatchTaskBatchRequestDto } from "@/api/tasks/rest/dto/patch-task-batch.dto";
import { toTaskBatchResponse } from "@/api/tasks/rest/mappers/task.mapper";
import { TaskBatchResponse } from "@/api/tasks/rest/responses/task-batch.response";
import { TaskBatchesService } from "@/api/tasks/services/task-batches.service";

@Controller("task-batches")
export class TaskBatchesController {
  constructor(private readonly taskBatchesService: TaskBatchesService) {}

  @Post()
  async createBatch(
    @Body() body: CreateTaskBatchRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TaskBatchResponse> {
    const batch = await this.taskBatchesService.create({
      createdBy: user.id,
      assigneeUserId: user.id,
      title: body.title,
      description: body.description ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      tagIds: body.tagIds ?? [],
      tasks: body.tasks.map((t) => ({
        title: t.title,
        description: t.description ?? null,
      })),
    });
    const tasks = await this.taskBatchesService.listBatchTasks(batch.id);
    return toTaskBatchResponse(batch, tasks);
  }

  @Get(":id")
  async getBatch(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<TaskBatchResponse> {
    const batch = await this.taskBatchesService.getBatch(user.id, id);
    const tasks = await this.taskBatchesService.listBatchTasks(batch.id);
    return toTaskBatchResponse(batch, tasks);
  }

  @Patch(":id")
  async updateBatch(
    @UuidV7Param("id") id: string,
    @Body() body: PatchTaskBatchRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TaskBatchResponse> {
    const batch = await this.taskBatchesService.updateBatch({
      id,
      userId: user.id,
      title: body.title,
      description: body.description,
      dueDate:
        body.dueDate === undefined
          ? undefined
          : body.dueDate === null
            ? null
            : new Date(body.dueDate),
      tagIds: body.tagIds,
    });
    const tasks = await this.taskBatchesService.listBatchTasks(batch.id);
    return toTaskBatchResponse(batch, tasks);
  }

  @Delete(":id")
  @HttpCode(204)
  async deleteBatch(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.taskBatchesService.deleteBatch(user.id, id);
  }
}
