import {
  AttachmentPlacement,
  AttachmentStatus,
} from "@/api/storage/attachments/models/attachment.model";

export interface AttachmentProps {
  id: string;
  ownerUserId: string;
  placement: AttachmentPlacement;
  storageKey: string;
  contentType: string;
  sizeBytes: number | null;
  fileName: string | null;
  status: AttachmentStatus;
  createdAt: Date;
}

export class Attachment {
  readonly id: string;
  readonly ownerUserId: string;
  readonly placement: AttachmentPlacement;
  readonly storageKey: string;
  readonly contentType: string;
  sizeBytes: number | null;
  readonly fileName: string | null;
  status: AttachmentStatus;
  readonly createdAt: Date;

  private constructor(props: AttachmentProps) {
    this.id = props.id;
    this.ownerUserId = props.ownerUserId;
    this.placement = props.placement;
    this.storageKey = props.storageKey;
    this.contentType = props.contentType;
    this.sizeBytes = props.sizeBytes;
    this.fileName = props.fileName;
    this.status = props.status;
    this.createdAt = props.createdAt;
  }

  static create(props: AttachmentProps): Attachment {
    return new Attachment(props);
  }

  isOwnedBy(userId: string): boolean {
    return this.ownerUserId === userId;
  }

  isActive(): boolean {
    return this.status === "active";
  }
}
