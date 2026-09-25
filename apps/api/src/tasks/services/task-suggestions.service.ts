import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { generateId } from "@/api/kernel/id";
import { NetworksService } from "@/api/networks/services/networks.service";
import { EventHandler } from "@/api/platform/events/decorators/event-handler.decorator";
import { EventsPublisher } from "@/api/platform/events/publisher/events-publisher";
import {
  TaskBatchUpserted,
  TaskSuggested,
  TaskSuggestionBroadcast,
  TaskSuggestionResolved,
  TaskSuggestionUpdated,
  TaskUpserted,
} from "@/api/platform/events/registry/events.registry";
import { EventOf } from "@/api/platform/events/registry/events.types";
import { TagsService } from "@/api/tags/services/tags.service";
import { Task } from "@/api/tasks/entities/task.entity";
import { TaskSuggestion } from "@/api/tasks/entities/task-suggestion.entity";
import {
  CreateTaskSuggestionInput,
  TaskSuggestionPayload,
  TaskSuggestionStatus,
  UpdateTaskSuggestionPayloadInput,
} from "@/api/tasks/models/task.model";
import { TaskSuggestionsRepository } from "@/api/tasks/repositories/task-suggestions.repository";
import { TasksRepository } from "@/api/tasks/repositories/tasks.repository";
import { toTaskSuggestionResponse } from "@/api/tasks/rest/mappers/task.mapper";
import { MaterializedTask } from "@/api/tasks/rest/responses/task-suggestion.response";
import { TaskBatchesService } from "@/api/tasks/services/task-batches.service";
import { TasksService } from "@/api/tasks/services/tasks.service";
import { SuggestionSyncConsumerGroup } from "@/api/tasks/suggestion-sync.consumer-group";
import { tasksError } from "@/api/tasks/tasks.errors";

@Injectable()
export class TaskSuggestionsService {
  constructor(
    private readonly suggestionsRepository: TaskSuggestionsRepository,
    private readonly tasksService: TasksService,
    private readonly taskBatchesService: TaskBatchesService,
    private readonly tasksRepository: TasksRepository,
    private readonly eventsPublisher: EventsPublisher,
    private readonly networks: NetworksService,
    private readonly tags: TagsService,
  ) {}

  @Transactional()
  async suggest(input: CreateTaskSuggestionInput): Promise<TaskSuggestion> {
    if (input.suggesterUserId === input.suggesteeUserId) {
      throw tasksError("cannot_suggest_to_self");
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

    // Opens the suggestee's inbox item (untagged — proposed tags live in the
    // payload and materialize onto the real task on accept).
    await this.eventsPublisher.publish(TaskSuggested, {
      suggestionId: id,
      suggesteeUserId: input.suggesteeUserId,
      suggesterUserId: input.suggesterUserId,
      title: input.payload.title,
      dueDate: input.payload.dueDate,
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
      throw tasksError("task_suggestion_not_found", { suggestionId: id });
    }
    return suggestion;
  }

  // GET :id view: the suggestion plus the real tasks it materialized on accept.
  @Transactional()
  async getSuggestionView(
    userId: string,
    id: string,
  ): Promise<{
    suggestion: TaskSuggestion;
    materializedTasks: MaterializedTask[];
  }> {
    const suggestion = await this.getSuggestion(userId, id);
    const materializedTasks = await this.materializedTasksFor(suggestion);
    return { suggestion, materializedTasks };
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

    const materialized = await this.materialize(suggestion);

    const updated = await this.suggestionsRepository.markAccepted(
      id,
      materialized,
    );
    await this.eventsPublisher.publish(TaskSuggestionResolved, {
      suggestionId: id,
      suggesteeUserId: suggestion.suggesteeUserId,
    });
    await this.publishUpdated(id);
    return updated ?? suggestion;
  }

  @Transactional()
  async reject(userId: string, id: string): Promise<TaskSuggestion> {
    const suggestion = await this.requirePending(userId, id, "suggestee");
    const updated = await this.suggestionsRepository.updateStatus(
      id,
      "rejected",
    );
    await this.eventsPublisher.publish(TaskSuggestionResolved, {
      suggestionId: id,
      suggesteeUserId: suggestion.suggesteeUserId,
    });
    await this.publishUpdated(id);
    return updated ?? suggestion;
  }

  // Suggester rescinds a still-pending suggestion.
  @Transactional()
  async rescind(userId: string, id: string): Promise<void> {
    const suggestion = await this.requirePending(userId, id, "suggester");
    await this.suggestionsRepository.updateStatus(id, "rejected");
    await this.eventsPublisher.publish(TaskSuggestionResolved, {
      suggestionId: id,
      suggesteeUserId: suggestion.suggesteeUserId,
    });
    await this.publishUpdated(id);
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
      throw tasksError("tasks_only_on_batch_suggestion");
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
      throw tasksError("batch_requires_tasks");
    }

    const updated = await this.suggestionsRepository.updatePayload(
      input.id,
      merged,
    );
    await this.eventsPublisher.publish(TaskSuggestionUpdated, {
      suggestionId: input.id,
      title: merged.title,
      dueDate: merged.dueDate,
      suggesteeUserId: suggestion.suggesteeUserId,
    });
    await this.publishUpdated(input.id);
    return updated ?? suggestion;
  }

  // A materialized task changed status: rebroadcast its parent suggestion (if
  // any) to both participants. Own consumer group so it never starves the
  // attention-items consumer of the same events.
  @EventHandler(TaskUpserted, SuggestionSyncConsumerGroup)
  async onMaterializedTaskChanged(
    payload: EventOf<typeof TaskUpserted>,
  ): Promise<void> {
    const suggestion =
      await this.suggestionsRepository.findByMaterializedTaskId(payload.taskId);
    if (suggestion) await this.publishUpdated(suggestion.id);
  }

  @EventHandler(TaskBatchUpserted, SuggestionSyncConsumerGroup)
  async onMaterializedBatchChanged(
    payload: EventOf<typeof TaskBatchUpserted>,
  ): Promise<void> {
    const suggestion =
      await this.suggestionsRepository.findByMaterializedBatchId(
        payload.taskBatchId,
      );
    if (suggestion) await this.publishUpdated(suggestion.id);
  }

  // Realtime broadcast of the full suggestion (incl. materialized tasks) to both
  // participants. Drives the in-chat card both ways.
  async publishUpdated(suggestionId: string): Promise<void> {
    const suggestion = await this.suggestionsRepository.getById(suggestionId);
    if (!suggestion) {
      return;
    }
    const materializedTasks = await this.materializedTasksFor(suggestion);
    await this.eventsPublisher.publish(TaskSuggestionBroadcast, {
      suggestion: toTaskSuggestionResponse(suggestion, materializedTasks),
    });
  }

  private async materializedTasksFor(
    suggestion: TaskSuggestion,
  ): Promise<MaterializedTask[]> {
    let tasks: Task[] = [];
    if (suggestion.materializedBatchId) {
      tasks = await this.tasksRepository.listByBatchId(
        suggestion.materializedBatchId,
      );
    } else if (suggestion.materializedTaskId) {
      const task = await this.tasksRepository.getById(
        suggestion.materializedTaskId,
      );
      if (task && !task.isDeleted) tasks = [task];
    }
    return tasks.map((t) => ({ id: t.id, title: t.title, status: t.status }));
  }

  private async requirePending(
    userId: string,
    id: string,
    as: "suggester" | "suggestee" | "either",
  ): Promise<TaskSuggestion> {
    const suggestion = await this.suggestionsRepository.getById(id);
    if (!suggestion) {
      throw tasksError("task_suggestion_not_found", { suggestionId: id });
    }
    const allowed =
      as === "suggestee"
        ? suggestion.isSuggestee(userId)
        : as === "suggester"
          ? suggestion.isSuggester(userId)
          : suggestion.isSuggestee(userId) || suggestion.isSuggester(userId);
    if (!allowed) {
      throw tasksError("cannot_act_on_suggestion", { suggestionId: id });
    }
    if (!suggestion.isPending()) {
      throw tasksError("suggestion_not_pending", { suggestionId: id });
    }
    return suggestion;
  }

  // Turns an accepted suggestion into real tasks created by the suggester and
  // assigned to the suggestee, with the proposed (suggestee-owned) tags. The
  // suggestee can re-tag afterward via PATCH /tasks|/task-batches. Returns the
  // materialized link to record on the suggestion.
  private async materialize(
    suggestion: TaskSuggestion,
  ): Promise<{ materializedTaskId?: string; materializedBatchId?: string }> {
    const { payload } = suggestion;
    const createdBy = suggestion.suggesterUserId;
    const assigneeUserId = suggestion.suggesteeUserId;

    if (payload.kind === "batch") {
      const batch = await this.taskBatchesService.create({
        createdBy,
        assigneeUserId,
        title: payload.title,
        dueDate: this.parseDate(payload.dueDate),
        tagIds: payload.tagIds,
        tasks: payload.tasks.map((t) => ({
          title: t.title,
          description: t.description,
        })),
      });
      return { materializedBatchId: batch.id };
    }

    const task = await this.tasksService.create({
      createdBy,
      assigneeUserId,
      title: payload.title,
      description: payload.description,
      dueDate: this.parseDate(payload.dueDate),
      tagIds: payload.tagIds,
    });
    return { materializedTaskId: task.id };
  }

  private validatePayload(payload: TaskSuggestionPayload): void {
    if (payload.kind === "batch" && payload.tasks.length === 0) {
      throw tasksError("batch_requires_tasks");
    }
  }

  private parseDate(value: string | null): Date | null {
    return value ? new Date(value) : null;
  }
}
