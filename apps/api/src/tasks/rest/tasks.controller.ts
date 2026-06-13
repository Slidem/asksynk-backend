import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { UuidV7Param } from "@/api/common/decorators/param.decorators";
import { toNonNegativeNumberOptional } from "@/api/common/utils/inputs";
import { CreateTaskRequestDto } from "@/api/tasks/rest/dto/create-task.dto";
import { ListTasksQueryDto } from "@/api/tasks/rest/dto/list-tasks-query.dto";
import { PatchTaskRequestDto } from "@/api/tasks/rest/dto/patch-task.dto";
import { toTaskResponse } from "@/api/tasks/rest/mappers/task.mapper";
import { TaskResponse } from "@/api/tasks/rest/responses/task.response";
import { TasksService } from "@/api/tasks/services/tasks.service";

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  async createTask(
    @Body() body: CreateTaskRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TaskResponse> {
    const task = await this.tasksService.create({
      createdBy: user.id,
      // Direct create is always your own task; assignment to others goes via suggestions.
      assigneeUserId: user.id,
      title: body.title,
      description: body.description ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      tagIds: body.tagIds ?? [],
      batchId: body.batchId ?? null,
    });
    return toTaskResponse(task);
  }

  @Get()
  async listTasks(
    @Query() query: ListTasksQueryDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TaskResponse[]> {
    const tasks = await this.tasksService.listTasks(user.id, {
      scope: query.scope,
      status: query.status,
      batchId: query.batchId,
      cursor: query.cursor,
      limit: toNonNegativeNumberOptional(query.limit),
    });
    return tasks.map(toTaskResponse);
  }

  @Get(":id")
  async getTask(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<TaskResponse> {
    const task = await this.tasksService.getTask(user.id, id);
    return toTaskResponse(task);
  }

  @Patch(":id")
  async updateTask(
    @UuidV7Param("id") id: string,
    @Body() body: PatchTaskRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TaskResponse> {
    const task = await this.tasksService.updateTask({
      id,
      userId: user.id,
      title: body.title,
      description: body.description,
      // undefined = unchanged; null = clear; string = set. (new Date(null) would be epoch.)
      dueDate:
        body.dueDate === undefined
          ? undefined
          : body.dueDate === null
            ? null
            : new Date(body.dueDate),
      status: body.status,
      tagIds: body.tagIds,
    });
    return toTaskResponse(task);
  }

  @Delete(":id")
  @HttpCode(204)
  async deleteTask(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.tasksService.deleteTask(user.id, id);
  }
}
