export type MessageSender =
  | { kind: "user"; userId: string }
  | { kind: "guest"; guestId: string };

// Status values mirror the attention item 1:1 so the sync is a passthrough.
export const MANAGED_MESSAGE_STATUSES = [
  "created",
  "in_progress",
  "resolved",
] as const;
export type ManagedMessageStatus = (typeof MANAGED_MESSAGE_STATUSES)[number];

// Present only on tagged messages (those that open a recipient attention item).
export type ManagedStatus = {
  type: "tagged_message";
  status: ManagedMessageStatus;
};

export interface MessageProps {
  id: string;
  threadId: string;
  parentMessageId: string | null;
  sender: MessageSender;
  body: string;
  tagIds: string[];
  attachmentIds: string[];
  // Set when the message embeds an inline task suggestion.
  suggestionId: string | null;
  // Set only on tagged messages; null otherwise (not manageable).
  managedStatus: ManagedStatus | null;
  createdAt: Date;
}

export class Message {
  readonly id: string;
  readonly threadId: string;
  readonly parentMessageId: string | null;
  readonly sender: MessageSender;
  readonly body: string;
  readonly tagIds: string[];
  readonly attachmentIds: string[];
  readonly suggestionId: string | null;
  readonly managedStatus: ManagedStatus | null;
  readonly createdAt: Date;

  private constructor(props: MessageProps) {
    this.id = props.id;
    this.threadId = props.threadId;
    this.parentMessageId = props.parentMessageId;
    this.sender = props.sender;
    this.body = props.body;
    this.tagIds = props.tagIds;
    this.attachmentIds = props.attachmentIds;
    this.suggestionId = props.suggestionId;
    this.managedStatus = props.managedStatus;
    this.createdAt = props.createdAt;
  }

  static create(props: MessageProps): Message {
    return new Message(props);
  }

  isReply(): boolean {
    return this.parentMessageId !== null;
  }
}
