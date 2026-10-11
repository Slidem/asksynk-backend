import { Attachment } from "@/api/storage/attachments/entities/attachment.entity";

export abstract class AttachmentsRepository {
  abstract add(attachment: Attachment): Promise<Attachment>;
  abstract getById(id: string): Promise<Attachment | null>;
  abstract getByIds(ids: string[]): Promise<Attachment[]>;
  abstract markActive(id: string, sizeBytes: number): Promise<Attachment | null>;
  abstract delete(id: string): Promise<void>;
}
