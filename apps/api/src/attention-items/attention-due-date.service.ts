import { Injectable } from "@nestjs/common";

import { AttentionItemsRepository } from "@/api/attention-items/attention-items.repository";
import {
  AnswerModeSpec,
  decideDueDate,
  TimeblockOccurrence,
} from "@/api/attention-items/domain/due-date.policy";
import { AttentionItem } from "@/api/attention-items/entities/attention-item.entity";
import { Clock } from "@/api/platform/clock/clock";
import { Tag } from "@/api/tags/entities/tag.entity";
import { TagRepository } from "@/api/tags/repositories/tags.repository";

// Loads tags + upcoming tagged occurrences and applies `decideDueDate`.
// Shared by messages and tasks.
@Injectable()
export class AttentionDueDateService {
  constructor(
    private readonly attentionItemsRepository: AttentionItemsRepository,
    private readonly tagRepository: TagRepository,
    private readonly clock: Clock,
  ) {}

  async deriveFromTags(
    tagIds: string[],
    base: Date,
  ): Promise<{ dueDate: Date | null; sourceCalendarEventId: string | null }> {
    if (tagIds.length === 0) {
      return { dueDate: null, sourceCalendarEventId: null };
    }

    const tags = await this.tagRepository.getByIds(tagIds);
    const occurrences = await this.fetchOccurrences(tags, base);
    const { dueDate, dueSourceEventId } = decideDueDate({
      answerModes: tags.map(toAnswerModeSpec),
      occurrences,
      base,
    });
    return { dueDate, sourceCalendarEventId: dueSourceEventId };
  }

  async recomputeForItems(items: AttentionItem[]): Promise<void> {
    // Pinned items hold an explicit due date — tag/calendar changes must not move it.
    const recomputable = items.filter((i) => !i.dueDatePinned);
    if (recomputable.length === 0) return;

    const allTagIds = [...new Set(recomputable.flatMap((i) => i.tagIds))];
    const tags = await this.tagRepository.getByIds(allTagIds);
    const answerModeByTagId = new Map(
      tags.map((t) => [t.id.toString(), toAnswerModeSpec(t)]),
    );

    const occurrences = await this.fetchOccurrences(tags, this.clock.now());

    const updates = recomputable.map((item) => {
      const { dueDate, dueSourceEventId } = decideDueDate({
        answerModes: item.tagIds
          .map((id) => answerModeByTagId.get(id))
          .filter((m): m is AnswerModeSpec => m !== undefined),
        occurrences,
        base: item.createdAt,
      });
      return { id: item.id, dueDate, sourceCalendarEventId: dueSourceEventId };
    });

    await this.attentionItemsRepository.batchUpdateDueDates(updates);
  }

  private async fetchOccurrences(
    tags: Tag[],
    after: Date,
  ): Promise<Map<string, TimeblockOccurrence>> {
    const timeblockTagIds = tags
      .filter((t) => t.answerMode.type === "timeblock")
      .map((t) => t.id.toString());

    if (timeblockTagIds.length === 0) {
      return new Map();
    }

    const rows =
      await this.attentionItemsRepository.findEarliestUpcomingOccurrenceForTags(
        timeblockTagIds,
        after,
      );
    return new Map(
      [...rows].map(([tagId, { date, eventId }]) => [
        tagId,
        { startAt: date, eventId },
      ]),
    );
  }
}

const toAnswerModeSpec = (tag: Tag): AnswerModeSpec =>
  tag.answerMode.type === "immediately"
    ? {
        tagId: tag.id.toString(),
        type: "immediately",
        responseTimeMillis: tag.answerMode.responseTimeMillis,
      }
    : { tagId: tag.id.toString(), type: "timeblock" };
