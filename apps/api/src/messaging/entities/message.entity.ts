export type MessageSender =
  | { kind: "user"; userId: string }
  | { kind: "guest"; guestId: string };

export interface MessageProps {
  id: string;
  threadId: string;
  sender: MessageSender;
  body: string;
  createdAt: Date;
}

export class Message {
  readonly id: string;
  readonly threadId: string;
  readonly sender: MessageSender;
  readonly body: string;
  readonly createdAt: Date;

  private constructor(props: MessageProps) {
    this.id = props.id;
    this.threadId = props.threadId;
    this.sender = props.sender;
    this.body = props.body;
    this.createdAt = props.createdAt;
  }

  static create(props: MessageProps): Message {
    return new Message(props);
  }
}
