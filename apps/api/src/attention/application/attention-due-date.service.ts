import { Injectable } from "@nestjs/common";

import { toAttentionItemView } from "@/api/attention/application/read/attention-item.view";
import { AttentionItem } from "@/api/attention/domain/attention-item";
import {
  AnswerModeSpec,
  decideDueDate,
  DueDateDecision,
  TimeblockOccurrence,
} from "@/api/attention/domain/due-date.policy";
import { AttentionItemsRepository } from "@/api/attention/domain/ports/attention-items.repository";
import { Clock } from "@/api/platform/clock/clock";
import { EventsPublisher } from "@/api/platform/events/publisher/events-publisher";
import { AttentionItemUpserted } from "@/api/platform/events/registry/events.registry";
import { CalendarOccurrencePort } from "@/api/scheduling/contract/occurrence.port";
import { TagCatalogPort } from "@/api/tagging/contract/tag-catalog.port";

// Loads tag answer modes + upcoming tagged occurrences and applies `decideDueDate`.
@Injectable()
export class AttentionDueDateService {
  constructor(
    private readonly attentionItemsRepository: AttentionItemsRepository,
    private readonly tagCatalog: TagCatalogPort,
    private readonly occurrences: CalendarOccurrencePort,
    private readonly eventsPublisher: EventsPublisher,
    private readonly clock: Clock,
  ) {}

  async decide(tagIds: string[], base: Date): Promise<DueDateDecision> {
    if (tagIds.length === 0) {
      return { dueDate: null, dueSourceEventId: null };
    }

    const answerModes = await this.tagCatalog.getAnswerModes(tagIds);
    const occurrences = await this.fetchOccurrences(answerModes, base);
    return decideDueDate({ answerModes, occurrences, base });
  }

  /** Re-derives due dates after a tag / calendar change; saves and publishes only
   *  the items whose date moved. Pinned, deleted and resolved items are left as is. */
  async recomputeForItems(items: AttentionItem[]): Promise<void> {
    const recomputable = items.filter(
      (i) => !i.dueDatePinned && !i.isDeleted && i.status !== "resolved",
    );
    if (recomputable.length === 0) return;

    const allTagIds = [...new Set(recomputable.flatMap((i) => i.tagIds))];
    const answerModes = await this.tagCatalog.getAnswerModes(allTagIds);
    const answerModeByTagId = new Map(answerModes.map((m) => [m.tagId, m]));

    const occurrences = await this.fetchOccurrences(
      answerModes,
      this.clock.now(),
    );

    const updates = recomputable
      .map((item) => {
        const { dueDate, dueSourceEventId } = decideDueDate({
          answerModes: item.tagIds
            .map((id) => answerModeByTagId.get(id))
            .filter((m): m is AnswerModeSpec => m !== undefined),
          occurrences,
          base: item.createdAt,
        });
        const changed =
          (dueDate?.getTime() ?? null) !== (item.dueDate?.getTime() ?? null) ||
          dueSourceEventId !== item.dueSourceEventId;
        return changed ? { id: item.id, dueDate, dueSourceEventId } : null;
      })
      .filter((u) => u !== null);

    const updated =
      await this.attentionItemsRepository.batchUpdateDueDates(updates);

    for (const item of updated) {
      await this.eventsPublisher.publish(AttentionItemUpserted, {
        item: toAttentionItemView(item),
      });
    }
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
