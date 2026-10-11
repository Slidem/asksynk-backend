import {
  ManagedStatus,
  Message,
  MessageSender,
} from "@/api/conversations/domain/message";
import { Thread } from "@/api/conversations/domain/thread";

export type ThreadParticipantRow = {
  threadId: string;
  userId: string | null;
  guestId: string | null;
};

export type OtherParticipantView =
  | {
      kind: "user";
      userId: string;
      name: string | null;
      firstName: string | null;
      lastName: string | null;
      email: string;
      image: string | null;
      isActiveConnection: boolean;
    }
  | {
      kind: "guest";
      guestId: string;
      displayName: string;
      publicViewId: string;
      publicViewName: string | null;
      publicViewExpired: boolean;
    };

type LastMessageView = {
  body: string;
  createdAt: Date;
  senderKind: "user" | "guest";
} | null;

export type ThreadListItem = {
  thread: Thread;
  other: OtherParticipantView;
  lastMessage: LastMessageView;
};

/** Messaging's own view of a thread list row; guest/link/connection facts come from ports. */
export type ThreadListRow = {
  thread: Thread;
  other:
    | Omit<Extract<OtherParticipantView, { kind: "user" }>, "isActiveConnection">
    | { kind: "guest"; guestId: string };
  lastMessage: LastMessageView;
};

export type ThreadMessageListItem = {
  message: Message;
  replyCount: number;
};

export type ThreadStats = {
  created: number;
  inProgress: number;
  resolved: number;
};

export abstract class MessagingRepository {
  abstract insertThread(input: {
    id: string;
    publicViewId: string | null;
  }): Promise<Thread>;
  abstract getThread(threadId: string): Promise<Thread | null>;
  abstract insertParticipants(rows: ThreadParticipantRow[]): Promise<void>;
  abstract getParticipants(threadId: string): Promise<ThreadParticipantRow[]>;
  abstract findUserPairThread(
    userIdA: string,
    userIdB: string,
  ): Promise<Thread | null>;
  abstract findGuestThread(guestId: string): Promise<Thread | null>;
  abstract isUserParticipant(threadId: string, userId: string): Promise<boolean>;
  abstract insertMessage(input: {
    id: string;
    threadId: string;
    parentMessageId?: string | null;
    sender: MessageSender;
    body: string;
    tagIds: string[];
    attachmentIds?: string[];
    suggestionId?: string | null;
    managedStatus?: ManagedStatus | null;
  }): Promise<Message>;
  abstract getMessageById(messageId: string): Promise<Message | null>;
  abstract replaceMessageTags(messageId: string, tagIds: string[]): Promise<void>;
  abstract updateManagedStatus(
    messageId: string,
    managedStatus: ManagedStatus | null,
  ): Promise<void>;
  abstract listMessages(
    threadId: string,
    options: { before?: Date; limit: number },
  ): Promise<ThreadMessageListItem[]>;
  abstract listTaggedMessages(threadId: string): Promise<ThreadMessageListItem[]>;
  abstract countManagedStatuses(threadId: string): Promise<ThreadStats>;
  abstract listReplies(
    parentMessageId: string,
    options: { before?: Date; limit: number },
  ): Promise<Message[]>;
  abstract listThreadsForUser(userId: string): Promise<ThreadListRow[]>;
}
