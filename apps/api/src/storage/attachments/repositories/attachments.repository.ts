import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { eq, inArray } from "drizzle-orm";

import { TxAdapter } from "@/api/infrastructure/db/tx.module";
import { Attachment } from "@/api/storage/attachments/entities/attachment.entity";
import { attachments } from "@/migrations/schema/attachments";

type AttachmentRow = typeof attachments.$inferSelect;

@Injectable()
export class AttachmentsRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  async add(attachment: Attachment): Promise<Attachment> {
    const [created] = await this.txHost.tx
      .insert(attachments)
      .values({
        id: attachment.id,
        ownerUserId: attachment.ownerUserId,
        placement: attachment.placement,
        storageKey: attachment.storageKey,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        fileName: attachment.fileName,
        status: attachment.status,
      })
      .returning();

    return this.mapRow(created);
  }

  async getById(id: string): Promise<Attachment | null> {
    const [row] = await this.txHost.tx
      .select()
      .from(attachments)
      .where(eq(attachments.id, id));

    return row ? this.mapRow(row) : null;
  }

  async getByIds(ids: string[]): Promise<Attachment[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.txHost.tx
      .select()
      .from(attachments)
      .where(inArray(attachments.id, ids));

    return rows.map((row) => this.mapRow(row));
  }

  async markActive(id: string, sizeBytes: number): Promise<Attachment | null> {
    const [updated] = await this.txHost.tx
      .update(attachments)
      .set({ status: "active", sizeBytes })
      .where(eq(attachments.id, id))
      .returning();

    // Row may have been concurrently discarded.
    return updated ? this.mapRow(updated) : null;
  }

  async delete(id: string): Promise<void> {
    await this.txHost.tx.delete(attachments).where(eq(attachments.id, id));
  }

  private mapRow(row: AttachmentRow): Attachment {
    return Attachment.create({
      id: row.id,
      ownerUserId: row.ownerUserId,
      placement: row.placement,
      storageKey: row.storageKey,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      fileName: row.fileName,
      status: row.status,
      createdAt: row.createdAt,
    });
  }
}
