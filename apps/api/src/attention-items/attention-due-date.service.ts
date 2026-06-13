import { Injectable } from "@nestjs/common";

import { AttentionItemsRepository } from "@/api/attention-items/attention-items.repository";
import { AttentionItem } from "@/api/attention-items/entities/attention-item.entity";
import { Tag } from "@/api/tags/entities/tag.entity";
import { TagRepository } from "@/api/tags/repositories/tags.repository";

// Derives attention-item due dates from a user's tags:
// immediate tags push out `base + responseTimeMillis`; timeblock tags resolve to
// the next upcoming tagged calendar occurrence. Shared by messages and tasks.
@Injectable()
export class AttentionDueDateService {
  constructor(
    private readonly attentionItemsRepository: AttentionItemsRepository,
    private readonly tagRepository: TagRepository,
  ) {}

  async deriveFromTags(
    tagIds: string[],
    base: Date,
  ): Promise<{ dueDate: Date | null; sourceCalendarEventId: string | null }> {
    if (tagIds.length === 0) {
      return { dueDate: null, sourceCalendarEventId: null };
    }

    const tags = await this.tagRepository.getByIds(tagIds);
    const occurrenceMap = await this.fetchOccurrenceMap(tags, base);
    return this.pickEarliestCandidate(tags, base, occurrenceMap);
  }

  async recomputeForItems(items: AttentionItem[]): Promise<void> {
    // Pinned items hold an explicit due date — tag/calendar changes must not move it.
    const recomputable = items.filter((i) => !i.dueDatePinned);
    if (recomputable.length === 0) return;

    const allTagIds = [...new Set(recomputable.flatMap((i) => i.tagIds))];
    const tags = await this.tagRepository.getByIds(allTagIds);
    const tagMap = new Map(tags.map((t) => [t.id.toString(), t]));

    const occurrenceMap = await this.fetchOccurrenceMap(tags, new Date());

    const updates = recomputable.map((item) => {
      const itemTags = item.tagIds
        .map((id) => tagMap.get(id))
        .filter((t): t is Tag => t !== undefined);
      const { dueDate, sourceCalendarEventId } = this.pickEarliestCandidate(
        itemTags,
        item.createdAt,
        occurrenceMap,
      );
      return { id: item.id, dueDate, sourceCalendarEventId };
    });

    await this.attentionItemsRepository.batchUpdateDueDates(updates);
  }

  private async fetchOccurrenceMap(
    tags: Tag[],
    after: Date,
  ): Promise<Map<string, { date: Date; eventId: string }>> {
    const timeblockTagIds = tags
      .filter((t) => t.answerMode.type === "timeblock")
      .map((t) => t.id.toString());

    if (timeblockTagIds.length === 0) {
      return new Map();
    }

    return this.attentionItemsRepository.findEarliestUpcomingOccurrenceForTags(
      timeblockTagIds,
      after,
    );
  }

  private pickEarliestCandidate(
    tags: Tag[],
    immediateBase: Date,
    occurrenceMap: Map<string, { date: Date; eventId: string }>,
  ): { dueDate: Date | null; sourceCalendarEventId: string | null } {
    let dueDate: Date | null = null;
    let sourceCalendarEventId: string | null = null;

    for (const tag of tags) {
      if (tag.answerMode.type === "immediately") {
        const candidate = new Date(
          immediateBase.getTime() + tag.answerMode.responseTimeMillis,
        );
        if (!dueDate || candidate < dueDate) {
          dueDate = candidate;
          sourceCalendarEventId = null;
        }
      } else {
        const candidate = occurrenceMap.get(tag.id.toString());
        if (candidate && (!dueDate || candidate.date < dueDate)) {
          dueDate = candidate.date;
          sourceCalendarEventId = candidate.eventId;
        }
      }
    }

    return { dueDate, sourceCalendarEventId };
  }
}
