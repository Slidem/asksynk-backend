import { Injectable } from "@nestjs/common";

import { AttentionItem } from "@/api/attention/domain/attention-item";
import {
  AnswerModeSpec,
  decideDueDate,
  TimeblockOccurrence,
} from "@/api/attention/domain/due-date.policy";
import { AttentionItemsRepository } from "@/api/attention/domain/ports/attention-items.repository";
import { Clock } from "@/api/platform/clock/clock";
import { CalendarOccurrencePort } from "@/api/scheduling/contract/occurrence.port";
import { TagCatalogPort } from "@/api/tagging/contract/tag-catalog.port";

// Loads tag answer modes + upcoming tagged occurrences and applies `decideDueDate`.
// Shared by messages and tasks.
@Injectable()
export class AttentionDueDateService {
  constructor(
    private readonly attentionItemsRepository: AttentionItemsRepository,
    private readonly tagCatalog: TagCatalogPort,
    private readonly occurrences: CalendarOccurrencePort,
    private readonly clock: Clock,
  ) {}

  async deriveFromTags(
    tagIds: string[],
    base: Date,
  ): Promise<{ dueDate: Date | null; sourceCalendarEventId: string | null }> {
    if (tagIds.length === 0) {
      return { dueDate: null, sourceCalendarEventId: null };
    }

    const answerModes = await this.tagCatalog.getAnswerModes(tagIds);
    const occurrences = await this.fetchOccurrences(answerModes, base);
    const { dueDate, dueSourceEventId } = decideDueDate({
      answerModes,
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
    const answerModes = await this.tagCatalog.getAnswerModes(allTagIds);
    const answerModeByTagId = new Map(answerModes.map((m) => [m.tagId, m]));

    const occurrences = await this.fetchOccurrences(
      answerModes,
      this.clock.now(),
    );

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
    answerModes: AnswerModeSpec[],
    after: Date,
  ): Promise<Map<string, TimeblockOccurrence>> {
    const timeblockTagIds = answerModes
      .filter((m) => m.type === "timeblock")
      .map((m) => m.tagId);

    if (timeblockTagIds.length === 0) {
      return new Map();
    }

    return this.occurrences.findNextOccurrenceByTag(timeblockTagIds, after);
  }
}
