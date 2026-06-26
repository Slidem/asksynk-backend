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
import { AsksynkError } from "@/api/common/errors/errors.model";
import { TaskSuggestionPayload } from "@/api/tasks/models/task.model";
import { CreateTaskSuggestionRequestDto } from "@/api/tasks/rest/dto/create-task-suggestion.dto";
import { ListTaskSuggestionsQueryDto } from "@/api/tasks/rest/dto/list-task-suggestions-query.dto";
import { PatchTaskSuggestionRequestDto } from "@/api/tasks/rest/dto/patch-task-suggestion.dto";
import { toTaskSuggestionResponse } from "@/api/tasks/rest/mappers/task.mapper";
import { TaskSuggestionResponse } from "@/api/tasks/rest/responses/task-suggestion.response";
import { TaskSuggestionsService } from "@/api/tasks/services/task-suggestions.service";

@Controller("task-suggestions")
export class TaskSuggestionsController {
  constructor(
    private readonly suggestionsService: TaskSuggestionsService,
  ) {}

  @Post()
  async createSuggestion(
    @Body() body: CreateTaskSuggestionRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TaskSuggestionResponse> {
    const suggestion = await this.suggestionsService.suggest({
      suggesterUserId: user.id,
      suggesteeUserId: body.suggesteeUserId,
      payload: this.toPayload(body.payload),
    });
    return toTaskSuggestionResponse(suggestion);
  }

  @Get()
  async listSuggestions(
    @Query() query: ListTaskSuggestionsQueryDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TaskSuggestionResponse[]> {
    const suggestions = await this.suggestionsService.list(
      user.id,
      query.role,
      query.status,
    );
    return suggestions.map((s) => toTaskSuggestionResponse(s));
  }

  @Get(":id")
  async getSuggestion(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<TaskSuggestionResponse> {
    const { suggestion, materializedTasks } =
      await this.suggestionsService.getSuggestionView(user.id, id);
    return toTaskSuggestionResponse(suggestion, materializedTasks);
  }

  @Patch(":id")
  async updateSuggestion(
    @UuidV7Param("id") id: string,
    @Body() body: PatchTaskSuggestionRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TaskSuggestionResponse> {
    const hasPayloadEdit =
      body.title !== undefined ||
      body.description !== undefined ||
      body.dueDate !== undefined ||
      body.tagIds !== undefined ||
      body.tasks !== undefined;

    if (body.status !== undefined && hasPayloadEdit) {
      throw AsksynkError.badRequest(
        "Cannot change status and edit payload in the same request",
      );
    }

    if (body.status !== undefined) {
      const suggestion =
        body.status === "accepted"
          ? await this.suggestionsService.accept(user.id, id)
          : await this.suggestionsService.reject(user.id, id);
      return toTaskSuggestionResponse(suggestion);
    }

    if (!hasPayloadEdit) {
      throw AsksynkError.badRequest("Nothing to update");
    }

    const suggestion = await this.suggestionsService.editPayload({
      id,
      userId: user.id,
      title: body.title,
      description: body.description,
      dueDate: body.dueDate,
      tagIds: body.tagIds,
      tasks: body.tasks?.map((t) => ({
        title: t.title,
        description: t.description ?? null,
      })),
    });
    return toTaskSuggestionResponse(suggestion);
  }

  @Delete(":id")
  @HttpCode(204)
  async deleteSuggestion(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.suggestionsService.rescind(user.id, id);
  }

  private toPayload(
    payload: CreateTaskSuggestionRequestDto["payload"],
  ): TaskSuggestionPayload {
    return {
      kind: payload.kind,
      title: payload.title,
      description: payload.description ?? null,
      // dueDate applies to both kinds (task due date / batch-level due date).
      dueDate: payload.dueDate ?? null,
      // The suggestee's tags (task-level or batch-level).
      tagIds: payload.tagIds ?? [],
      tasks:
        payload.kind === "batch"
          ? (payload.tasks ?? []).map((t) => ({
              title: t.title,
              description: t.description ?? null,
            }))
          : [],
    };
  }
}
