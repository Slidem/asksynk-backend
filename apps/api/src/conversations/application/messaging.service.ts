import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { SendMessageInput } from "@/api/conversations/application/send-message.model";
import { messagingError } from "@/api/conversations/conversations.errors";
import {
  ManagedMessageStatus,
  ManagedStatus,
  Message,
  MessageSender,
} from "@/api/conversations/domain/message";
import {
  MessagingRepository,
  ThreadListItem,
  ThreadMessageListItem,
  ThreadParticipantRow,
  ThreadStats,
} from "@/api/conversations/domain/ports/messaging.repository";
import { Thread } from "@/api/conversations/domain/thread";
import { AttachmentCatalogPort } from "@/api/files/contract/attachment-catalog.port";
import { Actor } from "@/api/kernel/actor/actor";
import { generateId } from "@/api/kernel/id";
import { ConnectionPolicyPort } from "@/api/network/contract/connection-policy.port";
import { EventsPublisher } from "@/api/platform/events/publisher/events-publisher";
import {
  MessageCreated,
  MessageManagedStatusChanged,
  MessageUpdated,
} from "@/api/platform/events/registry/events.registry";
import { PublicLinkPort } from "@/api/sharing/contract/public-link.port";
import { TagCatalogPort } from "@/api/tagging/contract/tag-catalog.port";
import { TaskSuggestionPort } from "@/api/tasks/contract/task-suggestion.port";

const MAX_MESSAGE_LIMIT = 100;

@Injectable()
export class MessagingService {
  constructor(
    private readonly messagingRepository: MessagingRepository,
    private readonly connections: ConnectionPolicyPort,
    private readonly publicLinks: PublicLinkPort,
    private readonly eventsPublisher: EventsPublisher,
    private readonly tagCatalog: TagCatalogPort,
    private readonly attachmentCatalog: AttachmentCatalogPort,
    private readonly taskSuggestions: TaskSuggestionPort,
  ) {}

  async listThreads(actor: Actor): Promise<ThreadListItem[]> {
    if (actor.kind === "guest") {
      throw messagingError("guest_cannot_list_threads");
    }
    const userId = actor.userId;
    const rows = await this.messagingRepository.listThreadsForUser(userId);

    const otherUserIds: string[] = [];
    const guestIds: string[] = [];
    const publicViewIds: string[] = [];
    for (const r of rows) {
      if (r.other.kind === "user") otherUserIds.push(r.other.userId);
      else guestIds.push(r.other.guestId);
      if (r.thread.publicViewId) publicViewIds.push(r.thread.publicViewId);
    }

    const [connected, guests, links] = await Promise.all([
      this.connections.connectedAmong(userId, otherUserIds),
      this.publicLinks.getGuestSummaries(guestIds),
      this.publicLinks.getLinkSummaries(publicViewIds),
    ]);

    return rows.map(({ thread, other, lastMessage }) => {
      if (other.kind === "user") {
        return {
          thread,
          lastMessage,
          other: { ...other, isActiveConnection: connected.has(other.userId) },
        };
      }
      const link = links.get(thread.publicViewId!);
      return {
        thread,
        lastMessage,
        other: {
          kind: "guest",
          guestId: other.guestId,
          displayName: guests.get(other.guestId)?.displayName ?? "",
          publicViewId: thread.publicViewId!,
          publicViewName: link?.name ?? null,
          publicViewExpired: !link?.live,
        },
      };
    });
  }

  async listMessages(
    actor: Actor,
    threadId: string | null,
    options: { before?: Date; limit?: number },
  ): Promise<ThreadMessageListItem[]> {
    const readableId = await this.readableThreadId(actor, threadId);
    if (!readableId) return [];
    return this.messagingRepository.listMessages(
      readableId,
      this.paged(options),
    );
  }

  async listReplies(
    actor: Actor,
    threadId: string | null,
    messageId: string,
    options: { before?: Date; limit?: number },
  ): Promise<Message[]> {
    const readableId = await this.readableThreadId(actor, threadId);
    if (!readableId) {
      throw messagingError("message_not_found_for_thread", {
        messageId,
        threadId: readableId,
      });
    }
    await this.assertReplyParent(readableId, messageId);
    return this.messagingRepository.listReplies(messageId, this.paged(options));
  }

  async getThreadStats(
    actor: Actor,
    threadId: string | null,
  ): Promise<ThreadStats> {
    const readableId = await this.readableThreadId(actor, threadId);
    if (!readableId) return { created: 0, inProgress: 0, resolved: 0 };
    return this.messagingRepository.countManagedStatuses(readableId);
  }

  async listTaggedMessages(
    actor: Actor,
    threadId: string | null,
  ): Promise<ThreadMessageListItem[]> {
    const readableId = await this.readableThreadId(actor, threadId);
    if (!readableId) return [];
    return this.messagingRepository.listTaggedMessages(readableId);
  }

  /**
   * The thread `actor` may read. Users: `threadId`, if they participate. Guests: their
   * own thread (`threadId` ignored), or null before their first message.
   */
  private async readableThreadId(
    actor: Actor,
    threadId: string | null,
  ): Promise<string | null> {
    if (actor.kind === "guest") {
      return this.resolveGuestThreadId(actor.guestId);
    }
    if (!threadId) {
      throw messagingError("thread_id_required");
    }
    await this.assertUserParticipant(threadId, actor.userId);
    return threadId;
  }

  private paged(options: { before?: Date; limit?: number }) {
    return {
      before: options.before,
      limit: Math.min(options.limit ?? 50, MAX_MESSAGE_LIMIT),
    };
  }

  private async assertUserParticipant(
    threadId: string,
    userId: string,
  ): Promise<void> {
    const isParticipant = await this.messagingRepository.isUserParticipant(
      threadId,
      userId,
    );
    if (!isParticipant) {
      throw messagingError("thread_not_found", { threadId });
    }
  }

  private async resolveGuestThreadId(guestId: string): Promise<string | null> {
    const thread = await this.messagingRepository.findGuestThread(guestId);
    return thread?.id ?? null;
  }

  private async assertReplyParent(
    threadId: string,
    messageId: string,
  ): Promise<void> {
    const parent = await this.messagingRepository.getMessageById(messageId);
    if (!parent || parent.threadId !== threadId) {
      throw messagingError("message_not_found", {
        messageId,
      });
    }
  }

  async canAccessThread(actor: Actor, threadId: string): Promise<boolean> {
    if (actor.kind === "user") {
      return this.messagingRepository.isUserParticipant(threadId, actor.userId);
    }

    const guestThread = await this.messagingRepository.findGuestThread(
      actor.guestId,
    );
    return guestThread?.id === threadId;
  }

  @Transactional()
  async createOrGetUserThread(
    actor: Actor,
    recipientUserId: string,
  ): Promise<Thread> {
    if (actor.kind === "guest") {
      throw messagingError("cannot_start_thread", {
        reason: "Guests cannot start threads",
      });
    }
    const userId = actor.userId;
    if (userId === recipientUserId) {
      throw messagingError("cannot_start_thread", {
        reason: "Cannot start a thread with yourself",
      });
    }
    const connected = await this.connections.areConnected(
      userId,
      recipientUserId,
    );

    if (!connected) {
      throw messagingError("cannot_start_thread", {
        reason: "Recipient is not in your network",
      });
    }

    const existing = await this.messagingRepository.findUserPairThread(
      userId,
      recipientUserId,
    );

    if (existing) {
      return existing;
    }

    const thread = await this.messagingRepository.insertThread({
      id: generateId(),
      publicViewId: null,
    });
    await this.messagingRepository.insertParticipants([
      { threadId: thread.id, userId, guestId: null },
      { threadId: thread.id, userId: recipientUserId, guestId: null },
    ]);
    return thread;
  }

  /**
   * Users post to a thread they participate in; guests post to their own thread
   * (created on first message) and cannot attach files or suggest tasks.
   */
  @Transactional()
  async send(actor: Actor, input: SendMessageInput): Promise<Message> {
    if (actor.kind === "guest") {
      if (input.attachmentIds.length > 0) {
        throw messagingError("guest_cannot_attach_files");
      }
      if (input.taskSuggestion) {
        throw messagingError("guest_cannot_suggest_tasks");
      }
      return this.sendAsGuest(actor, input);
    }

    if (!input.threadId) {
      throw messagingError("thread_id_required");
    }
    return this.sendAsUser(actor.userId, input.threadId, input);
  }

  private async sendAsUser(
    senderUserId: string,
    threadId: string,
    {
      body,
      tagIds,
      parentMessageId,
      attachmentIds,
      taskSuggestion,
    }: SendMessageInput,
  ): Promise<Message> {
    const thread = await this.messagingRepository.getThread(threadId);

    if (!thread) {
      throw messagingError("thread_not_found", { threadId });
    }

    const isParticipant = await this.messagingRepository.isUserParticipant(
      threadId,
      senderUserId,
    );
    if (!isParticipant) {
      throw messagingError("thread_not_found", { threadId });
    }

    await this.assertNotFrozen(thread, senderUserId);

    const sender: MessageSender = { kind: "user", userId: senderUserId };
    const participants =
      await this.messagingRepository.getParticipants(threadId);

    if (tagIds.length > 0) {
      const recipientUserId = this.resolveRecipientUserId(sender, participants);
      if (!recipientUserId) {
        throw messagingError("cannot_start_thread", {
          reason: "Tagging not supported on this thread",
        });
      }
      await this.tagCatalog.assertOwnedBy(recipientUserId, tagIds);
    }

    if (parentMessageId) {
      await this.assertValidReplyParent(threadId, parentMessageId);
    }

    // Authz gate: sender must own each blob, finalized + declared for "message" placement.
    await this.attachmentCatalog.assertUsable(attachmentIds, {
      ownerUserId: senderUserId,
      placement: "message",
    });

    // Inline task suggestion → a real suggestion for the thread's other user.
    // suggest() enforces the active network connection + tag ownership and opens
    // the suggestee's inbox item. Same tx: message + suggestion commit together.
    let suggestionId: string | null = null;
    if (taskSuggestion) {
      const recipientUserId = this.resolveRecipientUserId(sender, participants);
      if (!recipientUserId) {
        throw messagingError("cannot_start_thread", {
          reason: "Task suggestions are not supported on this thread",
        });
      }
      const suggestion = await this.taskSuggestions.suggest({
        suggesterUserId: senderUserId,
        suggesteeUserId: recipientUserId,
        payload: taskSuggestion,
      });
      suggestionId = suggestion.id;
    }

    const message = await this.messagingRepository.insertMessage({
      id: generateId(),
      threadId,
      parentMessageId: parentMessageId ?? null,
      sender,
      body,
      tagIds,
      attachmentIds,
      suggestionId,
      managedStatus: this.initialManagedStatus(tagIds),
    });

    await this.notifyMessage(message, participants, MessageCreated);

    return message;
  }

  private async sendAsGuest(
    guest: Extract<Actor, { kind: "guest" }>,
    { body, tagIds, parentMessageId }: SendMessageInput,
  ): Promise<Message> {
    // Guest tags the owner's own tags — they drive the owner's attention item.
    if (tagIds.length > 0) {
      await this.tagCatalog.assertOwnedBy(guest.ownerUserId, tagIds);
    }

    let thread = await this.messagingRepository.findGuestThread(guest.guestId);
    if (!thread) {
      thread = await this.messagingRepository.insertThread({
        id: generateId(),
        publicViewId: guest.publicViewId,
      });
      await this.messagingRepository.insertParticipants([
        { threadId: thread.id, userId: guest.ownerUserId, guestId: null },
        { threadId: thread.id, userId: null, guestId: guest.guestId },
      ]);
    }

    if (parentMessageId) {
      await this.assertValidReplyParent(thread.id, parentMessageId);
    }

    const message = await this.messagingRepository.insertMessage({
      id: generateId(),
      threadId: thread.id,
      parentMessageId: parentMessageId ?? null,
      sender: { kind: "guest", guestId: guest.guestId },
      body,
      tagIds,
      managedStatus: this.initialManagedStatus(tagIds),
    });

    const participants = await this.messagingRepository.getParticipants(
      thread.id,
    );

    await this.notifyMessage(message, participants, MessageCreated);

    return message;
  }

  @Transactional()
  async tagMessage(
    actor: Actor,
    messageId: string,
    tagIds: string[],
  ): Promise<Message> {
    return actor.kind === "guest"
      ? this.tagMessageAsGuest(actor, messageId, tagIds)
      : this.tagMessageAsUser(actor.userId, messageId, tagIds);
  }

  private async tagMessageAsUser(
    callerUserId: string,
    messageId: string,
    tagIds: string[],
  ): Promise<Message> {
    const message = await this.messagingRepository.getMessageById(messageId);
    if (!message) {
      throw messagingError("message_not_found", {
        messageId,
      });
    }

    const isParticipant = await this.messagingRepository.isUserParticipant(
      message.threadId,
      callerUserId,
    );

    if (!isParticipant) {
      throw messagingError("thread_not_found", {
        threadId: message.threadId,
      });
    }

    const participants = await this.messagingRepository.getParticipants(
      message.threadId,
    );

    const recipientUserId = this.resolveRecipientUserId(
      message.sender,
      participants,
    );

    if (!recipientUserId) {
      throw messagingError("cannot_start_thread", {
        reason: "Tagging not supported on this message",
      });
    }

    await this.tagCatalog.assertOwnedBy(recipientUserId, tagIds);
    await this.messagingRepository.replaceMessageTags(messageId, tagIds);
    await this.reconcileManagedStatus(message.managedStatus, messageId, tagIds);

    const updated = await this.messagingRepository.getMessageById(messageId);
    if (!updated) {
      throw messagingError("message_not_found", {
        messageId,
      });
    }

    await this.notifyMessage(updated, participants, MessageUpdated);

    return updated;
  }

  private async tagMessageAsGuest(
    guest: Extract<Actor, { kind: "guest" }>,
    messageId: string,
    tagIds: string[],
  ): Promise<Message> {
    const message = await this.messagingRepository.getMessageById(messageId);
    if (!message) {
      throw messagingError("message_not_found", {
        messageId,
      });
    }

    const thread = await this.messagingRepository.findGuestThread(
      guest.guestId,
    );
    if (!thread || thread.id !== message.threadId) {
      throw messagingError("thread_not_found", {
        threadId: message.threadId,
      });
    }

    // Guests re-tag only their own messages; the owner's own messages have no
    // attention-item recipient in a guest thread.
    if (
      message.sender.kind !== "guest" ||
      message.sender.guestId !== guest.guestId
    ) {
      throw messagingError("cannot_tag_message", {
        reason: "Guests can only tag their own messages in a guest thread",
      });
    }

    await this.tagCatalog.assertOwnedBy(guest.ownerUserId, tagIds);
    await this.messagingRepository.replaceMessageTags(messageId, tagIds);
    await this.reconcileManagedStatus(message.managedStatus, messageId, tagIds);

    const updated = await this.messagingRepository.getMessageById(messageId);
    if (!updated) {
      throw messagingError("message_not_found", {
        messageId,
      });
    }

    const participants = await this.messagingRepository.getParticipants(
      message.threadId,
    );

    await this.notifyMessage(updated, participants, MessageUpdated);

    return updated;
  }

  /**
   * Forward sync: the recipient sets a managed message's status. Publishes
   * `MessageManagedStatusChanged` (durable leg mirrors the attention item,
   * realtime leg pushes to the thread). Recipient-only — the sender cannot
   * resolve their own tagged message.
   */
  @Transactional()
  async updateManagedStatus(
    actor: Actor,
    messageId: string,
    status: ManagedMessageStatus,
  ): Promise<Message> {
    // Guests are never recipients of a managed message.
    if (actor.kind === "guest") {
      throw messagingError("guest_cannot_update_status");
    }
    const userId = actor.userId;
    const message = await this.messagingRepository.getMessageById(messageId);
    if (!message) {
      throw messagingError("message_not_found", {
        messageId,
      });
    }
    if (!message.managedStatus) {
      throw messagingError("cannot_update_message", {
        reason: "Message is not manageable",
      });
    }

    const isParticipant = await this.messagingRepository.isUserParticipant(
      message.threadId,
      userId,
    );
    if (!isParticipant) {
      throw messagingError("thread_not_found", {
        threadId: message.threadId,
      });
    }
    if (message.sender.kind === "user" && message.sender.userId === userId) {
      throw messagingError("cannot_update_message", {
        reason: "Only the recipient can update this message's status",
      });
    }

    if (message.managedStatus.status === status) {
      return message; // idempotent — no event
    }

    const managedStatus: ManagedStatus = { ...message.managedStatus, status };
    await this.messagingRepository.updateManagedStatus(
      messageId,
      managedStatus,
    );
    await this.publishManagedStatusChanged(
      userId,
      message.threadId,
      messageId,
      managedStatus,
    );

    return Message.create({ ...message, managedStatus });
  }

  /**
   * Reverse sync: a tagged_message attention item was resolved from the inbox.
   * Reflects the status back onto the message. Idempotent so the re-published
   * `MessageManagedStatusChanged` no-ops on the attention side (no loop).
   */
  @Transactional()
  async applyManagedStatusFromAttention(
    userId: string,
    messageId: string,
    status: ManagedMessageStatus,
  ): Promise<void> {
    const message = await this.messagingRepository.getMessageById(messageId);
    if (!message?.managedStatus) {
      return; // message not managed — nothing to reflect
    }
    if (message.managedStatus.status === status) {
      return; // already in sync
    }

    const managedStatus: ManagedStatus = { ...message.managedStatus, status };
    await this.messagingRepository.updateManagedStatus(
      messageId,
      managedStatus,
    );
    await this.publishManagedStatusChanged(
      userId,
      message.threadId,
      messageId,
      managedStatus,
    );
  }

  private initialManagedStatus(tagIds: string[]): ManagedStatus | null {
    return tagIds.length > 0
      ? { type: "tagged_message", status: "created" }
      : null;
  }

  /** Keep managed_status in lockstep with tagged state across a re-tag. */
  private async reconcileManagedStatus(
    prior: ManagedStatus | null,
    messageId: string,
    tagIds: string[],
  ): Promise<void> {
    let next = prior;
    if (tagIds.length === 0) {
      next = null;
    } else if (!prior) {
      next = { type: "tagged_message", status: "created" };
    }
    if (next !== prior) {
      await this.messagingRepository.updateManagedStatus(messageId, next);
    }
  }

  private async publishManagedStatusChanged(
    userId: string,
    threadId: string,
    messageId: string,
    managedStatus: ManagedStatus,
  ): Promise<void> {
    await this.eventsPublisher.publish(MessageManagedStatusChanged, {
      userId,
      threadId,
      messageId,
      managedStatus,
    });
  }

  private resolveRecipientUserId(
    sender: MessageSender,
    participants: ThreadParticipantRow[],
  ): string | null {
    if (sender.kind === "user") {
      const other = participants.find(
        (p) => p.userId && p.userId !== sender.userId,
      );
      return other?.userId ?? null;
    }
    const owner = participants.find((p) => p.userId);
    return owner?.userId ?? null;
  }

  private async assertValidReplyParent(
    threadId: string,
    parentMessageId: string,
  ): Promise<void> {
    const parent =
      await this.messagingRepository.getMessageById(parentMessageId);

    if (!parent || parent.threadId !== threadId) {
      throw messagingError("message_not_found_for_thread", {
        messageId: parentMessageId,
        threadId,
      });
    }
    if (parent.isReply()) {
      throw messagingError("cannot_reply_to_message", {
        reason: "Cannot reply to a message that is already a reply",
      });
    }
  }

  private async notifyMessage(
    message: Message,
    participants: ThreadParticipantRow[],
    eventType: typeof MessageCreated | typeof MessageUpdated,
  ): Promise<void> {
    const senderId =
      message.sender.kind === "user"
        ? message.sender.userId
        : message.sender.guestId;

    const participantUserIds = participants
      .map((p) => p.userId)
      .filter((id): id is string => !!id && id !== senderId);

    const participantGuestIds = participants
      .map((p) => p.guestId)
      .filter((id): id is string => !!id && id !== senderId);

    const notificationPromises: Promise<void>[] = [];

    const messageForDispatch = {
      id: message.id,
      threadId: message.threadId,
      parentMessageId: message.parentMessageId,
      senderKind: message.sender.kind,
      senderId: senderId,
      body: message.body,
      tagIds: message.tagIds,
      attachmentIds: message.attachmentIds,
      suggestionId: message.suggestionId,
      managedStatus: message.managedStatus ?? undefined,
      createdAt: message.createdAt.toISOString(),
    };

    for (const userId of participantUserIds) {
      notificationPromises.push(
        this.eventsPublisher.publish(eventType, {
          threadId: message.threadId,
          message: messageForDispatch,
          sentToUserId: userId,
        }),
      );
    }

    for (const guestId of participantGuestIds) {
      notificationPromises.push(
        this.eventsPublisher.publish(eventType, {
          threadId: message.threadId,
          message: messageForDispatch,
          sentToGuestId: guestId,
        }),
      );
    }

    await Promise.all(notificationPromises);
  }

  private async assertNotFrozen(
    thread: Thread,
    userSenderId: string,
  ): Promise<void> {
    if (thread.isGuestThread()) {
      if (!(await this.publicLinks.isLive(thread.publicViewId!))) {
        throw messagingError("thread_is_frozen", {
          threadId: thread.id,
        });
      }
      return;
    }

    const participants = await this.messagingRepository.getParticipants(
      thread.id,
    );
    const otherUser = participants.find(
      (p) => p.userId && p.userId !== userSenderId,
    );

    if (!otherUser?.userId) {
      throw messagingError("thread_is_frozen", {
        threadId: thread.id,
      });
    }

    const connected = await this.connections.areConnected(
      userSenderId,
      otherUser.userId,
    );

    if (!connected) {
      throw messagingError("thread_is_frozen", {
        threadId: thread.id,
      });
    }
  }
}
