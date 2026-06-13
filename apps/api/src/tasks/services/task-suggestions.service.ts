import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { AttentionItemsService } from "@/api/attention-items/attention-items.service";
import { AsksynkError } from "@/api/common/errors/errors.model";
import { NetworksService } from "@/api/networks/services/networks.service";
import { TagsService } from "@/api/tags/services/tags.service";
import { TaskSuggestion } from "@/api/tasks/entities/task-suggestion.entity";
import {
  CreateTaskSuggestionInput,
  TaskSuggestionPayload,
  TaskSuggestionStatus,
  UpdateTaskSuggestionPayloadInput,
} from "@/api/tasks/models/task.model";
import { TaskSuggestionsRepository } from "@/api/tasks/repositories/task-suggestions.repository";
import { TaskBatchesService } from "@/api/tasks/services/task-batches.service";
import { TasksService } from "@/api/tasks/services/tasks.service";
import { generateId } from "@/shared/id";

@Injectable()
export class TaskSuggestionsService {
  constructor(
    private readonly suggestionsRepository: TaskSuggestionsRepository,
    private readonly tasksService: TasksService,
    private readonly taskBatchesService: TaskBatchesService,
    private readonly attentionItems: AttentionItemsService,
    private readonly networks: NetworksService,
    private readonly tags: TagsService,
  ) {}

  @Transactional()
  async suggest(input: CreateTaskSuggestionInput): Promise<TaskSuggestion> {
    if (input.suggesterUserId === input.suggesteeUserId) {
      throw AsksynkError.badRequest("Cannot suggest a task to yourself");
    }
    await this.networks.validateIsActiveConnection(
      input.suggesterUserId,
      input.suggesteeUserId,
    );
    this.validatePayload(input.payload);
    // Proposed tags must belong to the suggestee (they drive their attention once accepted).
    await this.tags.assertOwnedBy(input.suggesteeUserId, input.payload.tagIds);

    const id = generateId();
    const suggestion = await this.suggestionsRepository.add(id, input);

    // Inbox notification for the suggestee. Stays untagged — the proposed tags
    // live in the payload and materialize onto the real task on accept.
    await this.attentionItems.create({
      id: generateId(),
      userId: input.suggesteeUserId,
      type: "suggested_task",
      dueDate: this.parseDate(input.payload.dueDate),
      metadata: {
        type: "suggested_task",
        suggestionId: id,
        suggesterUserId: input.suggesterUserId,
        title: input.payload.title,
      },
      tagIds: [],
      sourceCalendarEventId: null,
    });

    return suggestion;
  }

  @Transactional()
  async getSuggestion(userId: string, id: string): Promise<TaskSuggestion> {
    const suggestion = await this.suggestionsRepository.getById(id);
    if (
      !suggestion ||
      (!suggestion.isSuggester(userId) && !suggestion.isSuggestee(userId))
    ) {
      throw AsksynkError.notFound("Task suggestion not found");
    }
    return suggestion;
  }

  async list(
    userId: string,
    role: "sent" | "received",
    status?: TaskSuggestionStatus,
  ): Promise<TaskSuggestion[]> {
    return role === "sent"
      ? this.suggestionsRepository.listForSuggester(userId, status)
      : this.suggestionsRepository.listForSuggestee(userId, status);
  }

  @Transactional()
  async accept(userId: string, id: string): Promise<TaskSuggestion> {
    const suggestion = await this.requirePending(userId, id, "suggestee");

    await this.materialize(suggestion);

    const updated = await this.suggestionsRepository.updateStatus(
      id,
      "accepted",
    );
    await this.attentionItems.syncSourceStatus(
      { suggestionId: id },
      "resolved",
    );
    return updated ?? suggestion;
  }

  @Transactional()
  async reject(userId: string, id: string): Promise<TaskSuggestion> {
    const suggestion = await this.requirePending(userId, id, "suggestee");
    const updated = await this.suggestionsRepository.updateStatus(
      id,
      "rejected",
    );
    await this.attentionItems.syncSourceStatus(
      { suggestionId: id },
      "resolved",
    );
    return updated ?? suggestion;
  }

  // Suggester rescinds a still-pending suggestion.
  @Transactional()
  async rescind(userId: string, id: string): Promise<void> {
    await this.requirePending(userId, id, "suggester");
    await this.suggestionsRepository.updateStatus(id, "rejected");
    await this.attentionItems.syncSourceStatus(
      { suggestionId: id },
      "resolved",
    );
  }

  // Edits a still-pending suggestion's payload. Allowed for both parties. `kind`
  // is immutable; `tasks` only applies to batch suggestions. Resyncs the
  // suggestee's inbox attention item with the new title + due date.
  @Transactional()
  async editPayload(
    input: UpdateTaskSuggestionPayloadInput,
  ): Promise<TaskSuggestion> {
    const suggestion = await this.requirePending(
      input.userId,
      input.id,
      "either",
    );
    const current = suggestion.payload;

    if (input.tasks !== undefined && current.kind !== "batch") {
      throw AsksynkError.badRequest("Only batch suggestions can have tasks");
    }
    if (input.tagIds !== undefined) {
      await this.tags.assertOwnedBy(suggestion.suggesteeUserId, input.tagIds);
    }

    const merged: TaskSuggestionPayload = {
      kind: current.kind,
      title: input.title ?? current.title,
      description:
        input.description !== undefined
          ? input.description
          : current.description,
      dueDate: input.dueDate !== undefined ? input.dueDate : current.dueDate,
      tagIds: input.tagIds !== undefined ? input.tagIds : current.tagIds,
      tasks: input.tasks !== undefined ? input.tasks : current.tasks,
    };

    if (merged.kind === "batch" && merged.tasks.length === 0) {
      throw AsksynkError.badRequest(
        "A batch suggestion needs at least one task",
      );
    }

    const updated = await this.suggestionsRepository.updatePayload(
      input.id,
      merged,
    );
    await this.attentionItems.syncSourceContent(
      { suggestionId: input.id },
      { title: merged.title, dueDate: this.parseDate(merged.dueDate) },
    );
    return updated ?? suggestion;
  }

  private async requirePending(
    userId: string,
    id: string,
    as: "suggester" | "suggestee" | "either",
  ): Promise<TaskSuggestion> {
    const suggestion = await this.suggestionsRepository.getById(id);
    if (!suggestion) {
      throw AsksynkError.notFound("Task suggestion not found");
    }
    const allowed =
      as === "suggestee"
        ? suggestion.isSuggestee(userId)
        : as === "suggester"
          ? suggestion.isSuggester(userId)
          : suggestion.isSuggestee(userId) || suggestion.isSuggester(userId);
    if (!allowed) {
      throw AsksynkError.forbidden("Not allowed to act on this suggestion");
    }
    if (!suggestion.isPending()) {
      throw AsksynkError.badRequest("Suggestion is not pending");
    }
    return suggestion;
  }

  // Turns an accepted suggestion into real tasks created by the suggester and
  // assigned to the suggestee, with the proposed (suggestee-owned) tags. The
  // suggestee can re-tag afterward via PATCH /tasks|/task-batches.
  private async materialize(suggestion: TaskSuggestion): Promise<void> {
    const { payload } = suggestion;
    const createdBy = suggestion.suggesterUserId;
    const assigneeUserId = suggestion.suggesteeUserId;

    if (payload.kind === "batch") {
      await this.taskBatchesService.create({
        createdBy,
        assigneeUserId,
        title: payload.title,
        description: payload.description,
        dueDate: this.parseDate(payload.dueDate),
        tagIds: payload.tagIds,
        tasks: payload.tasks.map((t) => ({
          title: t.title,
          description: t.description,
        })),
      });
      return;
    }

    await this.tasksService.create({
      createdBy,
      assigneeUserId,
      title: payload.title,
      description: payload.description,
      dueDate: this.parseDate(payload.dueDate),
      tagIds: payload.tagIds,
    });
  }

  private validatePayload(payload: TaskSuggestionPayload): void {
    if (payload.kind === "batch" && payload.tasks.length === 0) {
      throw AsksynkError.badRequest(
        "A batch suggestion needs at least one task",
      );
    }
  }

  private parseDate(value: string | null): Date | null {
    return value ? new Date(value) : null;
  }
}
