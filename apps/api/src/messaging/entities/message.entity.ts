export type MessageSender =
  | { kind: "user"; userId: string }
  | { kind: "guest"; guestId: string };

export interface MessageProps {
  id: string;
  threadId: string;
  parentMessageId: string | null;
  sender: MessageSender;
  body: string;
  tagIds: string[];
  attachmentIds: string[];
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
  readonly createdAt: Date;

  private constructor(props: MessageProps) {
    this.id = props.id;
    this.threadId = props.threadId;
    this.parentMessageId = props.parentMessageId;
    this.sender = props.sender;
    this.body = props.body;
    this.tagIds = props.tagIds;
    this.attachmentIds = props.attachmentIds;
    this.createdAt = props.createdAt;
  }

  static create(props: MessageProps): Message {
    return new Message(props);
  }

  isReply(): boolean {
    return this.parentMessageId !== null;
  }
}
