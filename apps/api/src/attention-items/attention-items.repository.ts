import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { ContextLogger } from "nestjs-context-logger";

import { AttentionItem } from "@/api/attention-items/entities/attention-item.entity";
import {
  AttentionItemMetadata,
  AttentionItemStatus,
  AttentionItemType,
  CreateAttentionItemInput,
  ListAttentionItemsInput,
} from "@/api/attention-items/models/attention-item.model";
import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { attentionItems } from "@/migrations/schema/attentionItems";
import { attentionItemTags } from "@/migrations/schema/attentionItemTags";
import { tags } from "@/migrations/schema/tags";

type AttentionItemRow = typeof attentionItems.$inferSelect;

@Injectable()
export class AttentionItemsRepository {
  private readonly logger = new ContextLogger(AttentionItemsRepository.name);

  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async add(input: CreateAttentionItemInput): Promise<AttentionItem> {
    this.logger.info("Adding attention item", {
      id: input.id,
      type: input.type,
    });

    const [created] = await this.txHost.tx
      .insert(attentionItems)
      .values({
        id: input.id,
        userId: input.userId,
        type: input.type,
        status: "created",
        dueDate: input.dueDate,
        metadata: input.metadata,
        sourceCalendarEventId: input.sourceCalendarEventId,
      })
      .returning();

    if (input.tagIds.length > 0) {
      await this.txHost.tx
        .insert(attentionItemTags)
        .values(
          input.tagIds.map((tagId) => ({ attentionItemId: input.id, tagId })),
        );
    }

    return this.mapRowToItem(created, input.tagIds);
  }

  async getById(id: string): Promise<AttentionItem | null> {
    const rows = await this.txHost.tx
      .select({
        item: attentionItems,
        tagId: tags.id,
      })
      .from(attentionItems)
      .leftJoin(
        attentionItemTags,
        eq(attentionItemTags.attentionItemId, attentionItems.id),
      )
      .leftJoin(tags, eq(tags.id, attentionItemTags.tagId))
      .where(eq(attentionItems.id, id));

    if (rows.length === 0) return null;

    return this.mapRowsToItem(rows);
  }

  async listByUserId(
    userId: string,
    input: ListAttentionItemsInput,
  ): Promise<AttentionItem[]> {
    const filters = [
      eq(attentionItems.userId, userId),
      isNull(attentionItems.deletedAt),
    ];

    if (input.status) {
      filters.push(eq(attentionItems.status, input.status));
    }

    if (input.type) {
      filters.push(eq(attentionItems.type, input.type));
    }

    if (input.cursor) {
      filters.push(lt(attentionItems.createdAt, new Date(input.cursor)));
    }

    const rows = await this.txHost.tx
      .select({
        item: attentionItems,
        tagId: tags.id,
      })
      .from(attentionItems)
      .leftJoin(
        attentionItemTags,
        eq(attentionItemTags.attentionItemId, attentionItems.id),
      )
      .leftJoin(tags, eq(tags.id, attentionItemTags.tagId))
      .where(and(...filters))
      .orderBy(sql`${attentionItems.createdAt} DESC`)
      .limit(input.limit ?? 50);

    return this.groupRowsToItems(rows);
  }

  async update(item: AttentionItem): Promise<AttentionItem> {
    this.logger.info("Updating attention item", { id: item.id });

    const [updated] = await this.txHost.tx
      .update(attentionItems)
      .set({
        status: item.status,
        note: item.note,
        updatedAt: new Date(),
      })
      .where(eq(attentionItems.id, item.id))
      .returning();

    await this.txHost.tx
      .delete(attentionItemTags)
      .where(eq(attentionItemTags.attentionItemId, item.id));

    if (item.tagIds.length > 0) {
      await this.txHost.tx
        .insert(attentionItemTags)
        .values(
          item.tagIds.map((tagId) => ({ attentionItemId: item.id, tagId })),
        );
    }

    return this.mapRowToItem(updated, item.tagIds);
  }

  async softDelete(id: string): Promise<void> {
    this.logger.info("Soft deleting attention item", { id });

    await this.txHost.tx
      .update(attentionItems)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(attentionItems.id, id));
  }

  async deleteTagAssociations(tagId: string): Promise<void> {
    await this.txHost.tx
      .delete(attentionItemTags)
      .where(eq(attentionItemTags.tagId, tagId));
  }

  async updateDueDate(
    id: string,
    dueDate: Date | null,
    sourceCalendarEventId: string | null,
  ): Promise<void> {
    await this.txHost.tx
      .update(attentionItems)
      .set({ dueDate, sourceCalendarEventId, updatedAt: new Date() })
      .where(eq(attentionItems.id, id));
  }

  async batchUpdateDueDates(
    updates: {
      id: string;
      dueDate: Date | null;
      sourceCalendarEventId: string | null;
    }[],
  ): Promise<void> {
    if (updates.length === 0) return;
    await Promise.all(
      updates.map((u) =>
        this.updateDueDate(u.id, u.dueDate, u.sourceCalendarEventId),
      ),
    );
  }

  async findByTagIds(tagIds: string[]): Promise<AttentionItem[]> {
    if (tagIds.length === 0) return [];

    // Step 1: find matching item ids via attentionItemTags directly.
    // No join with `tags` here on purpose — we want to match even via ghost
    // junction rows (rows pointing to a tag that was just deleted), so
    // onTagDeleted can still locate its affected items.
    const matching = await this.txHost.tx
      .selectDistinct({ id: attentionItemTags.attentionItemId })
      .from(attentionItemTags)
      .where(inArray(attentionItemTags.tagId, tagIds));

    // Step 2: load each item with its FULL (ghost-filtered) tag list.
    return this.findByIds(matching.map((r) => r.id));
  }

  private async findByIds(ids: string[]): Promise<AttentionItem[]> {
    if (ids.length === 0) return [];

    const rows = await this.txHost.tx
      .select({
        item: attentionItems,
        tagId: tags.id,
      })
      .from(attentionItems)
      .leftJoin(
        attentionItemTags,
        eq(attentionItemTags.attentionItemId, attentionItems.id),
      )
      .leftJoin(tags, eq(tags.id, attentionItemTags.tagId))
      .where(
        and(isNull(attentionItems.deletedAt), inArray(attentionItems.id, ids)),
      );

    return this.groupRowsToItems(rows);
  }

  async findByMessageId(messageId: string): Promise<AttentionItem[]> {
    const rows = await this.txHost.tx
      .select({
        item: attentionItems,
        tagId: tags.id,
      })
      .from(attentionItems)
      .leftJoin(
        attentionItemTags,
        eq(attentionItemTags.attentionItemId, attentionItems.id),
      )
      .leftJoin(tags, eq(tags.id, attentionItemTags.tagId))
      .where(
        and(
          isNull(attentionItems.deletedAt),
          sql`${attentionItems.metadata}->>'messageId' = ${messageId}`,
        ),
      );

    return this.groupRowsToItems(rows);
  }

  async findBySourceCalendarEventId(eventId: string): Promise<AttentionItem[]> {
    const rows = await this.txHost.tx
      .select({
        item: attentionItems,
        tagId: tags.id,
      })
      .from(attentionItems)
      .leftJoin(
        attentionItemTags,
        eq(attentionItemTags.attentionItemId, attentionItems.id),
      )
      .leftJoin(tags, eq(tags.id, attentionItemTags.tagId))
      .where(
        and(
          isNull(attentionItems.deletedAt),
          eq(attentionItems.sourceCalendarEventId, eventId),
        ),
      );

    return this.groupRowsToItems(rows);
  }

  async findEarliestUpcomingOccurrenceForTags(
    tagIds: string[],
    after: Date,
  ): Promise<Map<string, { date: Date; eventId: string }>> {
    if (tagIds.length === 0) return new Map();

    const afterIso = after.toISOString();
    const windowEndIso = new Date(
      after.getTime() + 365 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const rows = await this.txHost.tx.execute<{
      tag_id: string;
      occ_start: string;
      event_id: string;
    }>(sql`
      WITH non_recurring AS (
        SELECT cet.tag_id, e.id AS event_id, e.start AS occ_start
        FROM calendar_events e
        JOIN calendar_event_tags cet ON cet.event_id = e.id
        WHERE cet.tag_id IN (${sql.join(
          tagIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
          AND e.rrule IS NULL
          AND e.start > ${afterIso}::timestamptz
      ),
      recurring AS (
        SELECT cet.tag_id, e.id AS event_id, occurrence AS occ_start
        FROM calendar_events e
        JOIN calendar_event_tags cet ON cet.event_id = e.id
        CROSS JOIN LATERAL rrule.between(e.rrule, e.start, ${afterIso}::timestamptz, ${windowEndIso}::timestamptz) AS occurrence
        WHERE cet.tag_id IN (${sql.join(
          tagIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
          AND e.rrule IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM calendar_event_exceptions ex
            WHERE ex.event_id = e.id AND ex.original_start = occurrence
          )
      ),
      combined AS (
        SELECT * FROM non_recurring
        UNION ALL
        SELECT * FROM recurring
      )
      SELECT DISTINCT ON (tag_id) tag_id, occ_start, event_id
      FROM combined
      ORDER BY tag_id, occ_start ASC, event_id ASC
    `);

    const result = new Map<string, { date: Date; eventId: string }>();

    for (const row of rows.rows) {
      result.set(row.tag_id, {
        date: new Date(row.occ_start),
        eventId: row.event_id,
      });
    }

    return result;
  }

  private mapRowsToItem(
    rows: { item: AttentionItemRow; tagId: string | null }[],
  ): AttentionItem {
    const [first] = rows;
    const tagIds = rows
      .map((r) => r.tagId)
      .filter((id): id is string => id !== null);
    return this.mapRowToItem(first.item, tagIds);
  }

  private groupRowsToItems(
    rows: { item: AttentionItemRow; tagId: string | null }[],
  ): AttentionItem[] {
    const itemMap = new Map<
      string,
      { row: AttentionItemRow; tagIds: string[] }
    >();

    for (const row of rows) {
      const existing = itemMap.get(row.item.id);
      if (existing) {
        if (row.tagId) existing.tagIds.push(row.tagId);
      } else {
        itemMap.set(row.item.id, {
          row: row.item,
          tagIds: row.tagId ? [row.tagId] : [],
        });
      }
    }

    return [...itemMap.values()].map(({ row, tagIds }) =>
      this.mapRowToItem(row, tagIds),
    );
  }

  private mapRowToItem(row: AttentionItemRow, tagIds: string[]): AttentionItem {
    return AttentionItem.create({
      id: row.id,
      userId: row.userId,
      type: row.type as AttentionItemType,
      status: row.status as AttentionItemStatus,
      dueDate: row.dueDate,
      note: row.note,
      metadata: row.metadata as AttentionItemMetadata,
      tagIds,
      sourceCalendarEventId: row.sourceCalendarEventId,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
