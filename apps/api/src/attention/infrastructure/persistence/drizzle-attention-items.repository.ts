import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { and, eq, inArray, isNull, lt, SQL, sql } from "drizzle-orm";
import { ContextLogger } from "nestjs-context-logger";

import { AttentionItemStatus } from "@/api/attention/contract/attention-item-status.public";
import {
  AttentionItem,
  AttentionItemState,
  AttentionPreview,
  AttentionSource,
  ListAttentionItemsInput,
} from "@/api/attention/domain/attention-item";
import { AttentionItemsRepository } from "@/api/attention/domain/ports/attention-items.repository";
import { TxAdapter } from "@/api/platform/db/tx.module";
import { attentionItems } from "@/migrations/schema/attentionItems";
import { attentionItemTags } from "@/migrations/schema/attentionItemTags";
import { tags } from "@/migrations/schema/tags";

type AttentionItemRow = typeof attentionItems.$inferSelect;

@Injectable()
export class DrizzleAttentionItemsRepository extends AttentionItemsRepository {
  private readonly logger = new ContextLogger(AttentionItemsRepository.name);

  constructor(private readonly txHost: TransactionHost<TxAdapter>) {
    super();
  }

  async getById(id: string): Promise<AttentionItem | null> {
    const [item] = await this.findWhere(eq(attentionItems.id, id));
    return item ?? null;
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

    if (input.sourceKind) {
      filters.push(eq(attentionItems.sourceKind, input.sourceKind));
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

  async findBySource(
    userId: string,
    source: AttentionSource,
  ): Promise<AttentionItem | null> {
    const [item] = await this.findWhere(this.sourceFilter(userId, source));
    return item ?? null;
  }

  async upsert(state: AttentionItemState): Promise<AttentionItem | null> {
    const values = {
      preview: state.preview,
      status: state.status,
      dueDate: state.dueDate,
      dueDatePinned: state.dueDatePinned,
      dueSourceEventId: state.dueSourceEventId,
    };

    const [row] = await this.txHost.tx
      .insert(attentionItems)
      .values({
        userId: state.userId,
        sourceContext: state.source.context,
        sourceKind: state.source.kind,
        sourceId: state.source.id,
        ...values,
      })
      .onConflictDoUpdate({
        target: [
          attentionItems.userId,
          attentionItems.sourceContext,
          attentionItems.sourceKind,
          attentionItems.sourceId,
        ],
        set: { ...values, updatedAt: new Date() },
        setWhere: isNull(attentionItems.deletedAt),
      })
      .returning();

    if (!row) return null;

    this.logger.info("Upserted attention item", {
      id: row.id,
      source: state.source,
    });

    await this.txHost.tx
      .delete(attentionItemTags)
      .where(eq(attentionItemTags.attentionItemId, row.id));

    if (state.tagIds.length > 0) {
      await this.txHost.tx
        .insert(attentionItemTags)
        .values(
          state.tagIds.map((tagId) => ({ attentionItemId: row.id, tagId })),
        );
    }

    return this.mapRowToItem(row, state.tagIds);
  }

  async deleteLiveBySource(
    userId: string,
    source: AttentionSource,
  ): Promise<string | null> {
    const [row] = await this.txHost.tx
      .delete(attentionItems)
      .where(
        and(
          this.sourceFilter(userId, source),
          isNull(attentionItems.deletedAt),
        ),
      )
      .returning({ id: attentionItems.id });

    return row?.id ?? null;
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

  async batchUpdateDueDates(
    updates: {
      id: string;
      dueDate: Date | null;
      dueSourceEventId: string | null;
    }[],
  ): Promise<AttentionItem[]> {
    if (updates.length === 0) return [];

    await Promise.all(
      updates.map((u) =>
        this.txHost.tx
          .update(attentionItems)
          .set({
            dueDate: u.dueDate,
            dueSourceEventId: u.dueSourceEventId,
            updatedAt: new Date(),
          })
          .where(eq(attentionItems.id, u.id)),
      ),
    );

    return this.findByIds(updates.map((u) => u.id));
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

  async findByDueSourceEventId(eventId: string): Promise<AttentionItem[]> {
    return this.findWhere(
      and(
        isNull(attentionItems.deletedAt),
        eq(attentionItems.dueSourceEventId, eventId),
      ),
    );
  }

  private async findByIds(ids: string[]): Promise<AttentionItem[]> {
    if (ids.length === 0) return [];
    return this.findWhere(
      and(isNull(attentionItems.deletedAt), inArray(attentionItems.id, ids)),
    );
  }

  private sourceFilter(userId: string, source: AttentionSource): SQL {
    return and(
      eq(attentionItems.userId, userId),
      eq(attentionItems.sourceContext, source.context),
      eq(attentionItems.sourceKind, source.kind),
      eq(attentionItems.sourceId, source.id),
    )!;
  }

  private async findWhere(where: SQL | undefined): Promise<AttentionItem[]> {
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
      .where(where);

    return this.groupRowsToItems(rows);
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
      source: {
        context: row.sourceContext,
        kind: row.sourceKind,
        id: row.sourceId,
      },
      preview: row.preview as AttentionPreview,
      status: row.status as AttentionItemStatus,
      tagIds,
      dueDate: row.dueDate,
      dueDatePinned: row.dueDatePinned,
      dueSourceEventId: row.dueSourceEventId,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
