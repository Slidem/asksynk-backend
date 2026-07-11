import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";
import { WsIdentity } from "src/websockets/services/ws-auth.service";

import { AuthGuest } from "@/api/auth/auth.types";
import { AsksynkError } from "@/api/common/errors/errors.model";
import { MessageAttachmentResolver } from "@/api/messaging/attachments/message-attachment.resolver";
import {
  ManagedMessageStatus,
  ManagedStatus,
  Message,
  MessageSender,
} from "@/api/messaging/entities/message.entity";
import { Thread } from "@/api/messaging/entities/thread.entity";
import {
  MessagingRepository,
  ThreadListItem,
  ThreadMessageListItem,
  ThreadParticipantRow,
  ThreadStats,
} from "@/api/messaging/repositories/messaging.repository";
import { NetworksService } from "@/api/networks/services/networks.service";
import { PublicViewsRepository } from "@/api/public-views/repositories/public-views.repository";
import { TagsService } from "@/api/tags/services/tags.service";
import { TaskSuggestionPayload } from "@/api/tasks/models/task.model";
import { TaskSuggestionsService } from "@/api/tasks/services/task-suggestions.service";
import { EventsPublisher } from "@/shared/event-publisher/events-publisher";
import {
  MessageCreated,
  MessageManagedStatusChanged,
  MessageUpdated,
} from "@/shared/event-registry/events.registry";
import { EventOf } from "@/shared/event-registry/events.types";
import { generateId } from "@/shared/id";

const MAX_MESSAGE_LIMIT = 100;

@Injectable()
export class MessagingService {
  constructor(
    private readonly messagingRepository: MessagingRepository,
    private readonly networksService: NetworksService,
    private readonly publicViewsRepository: PublicViewsRepository,
    private readonly eventsPublisher: EventsPublisher,
    private readonly tagsService: TagsService,
    private readonly messageAttachmentResolver: MessageAttachmentResolver,
    private readonly taskSuggestionsService: TaskSuggestionsService,
  ) {}

  async listThreadsForUser(userId: string): Promise<ThreadListItem[]> {
    return this.messagingRepository.listThreadsForUser(userId);
  }

  async listThreadMessages(
    userId: string,
    threadId: string,
    options: { before?: Date; limit?: number },
  ): Promise<ThreadMessageListItem[]> {
    await this.assertUserParticipant(threadId, userId);
    return this.messagingRepository.listMessages(threadId, this.paged(options));
  }

  async listGuestThreadMessages(
    guest: AuthGuest,
    options: { before?: Date; limit?: number },
  ): Promise<ThreadMessageListItem[]> {
    const threadId = await this.resolveGuestThreadId(guest.id);
    if (!threadId) return [];
    return this.messagingRepository.listMessages(threadId, this.paged(options));
  }

  async listThreadMessageReplies(
    userId: string,
    threadId: string,
    messageId: string,
    options: { before?: Date; limit?: number },
  ): Promise<Message[]> {
    await this.assertUserParticipant(threadId, userId);
    await this.assertReplyParent(threadId, messageId);
    return this.messagingRepository.listReplies(messageId, this.paged(options));
  }

  async listGuestMessageReplies(
    guest: AuthGuest,
    messageId: string,
    options: { before?: Date; limit?: number },
  ): Promise<Message[]> {
    const threadId = await this.resolveGuestThreadId(guest.id);
    if (!threadId) throw AsksynkError.notFound("Message not found");
    await this.assertReplyParent(threadId, messageId);
    return this.messagingRepository.listReplies(messageId, this.paged(options));
  }

  async getThreadStats(userId: string, threadId: string): Promise<ThreadStats> {
    await this.assertUserParticipant(threadId, userId);
    return this.messagingRepository.countManagedStatuses(threadId);
  }

  async getGuestThreadStats(guest: AuthGuest): Promise<ThreadStats> {
    const threadId = await this.resolveGuestThreadId(guest.id);
    if (!threadId) return { created: 0, inProgress: 0, resolved: 0 };
    return this.messagingRepository.countManagedStatuses(threadId);
  }

  async listThreadTaggedMessages(
    userId: string,
    threadId: string,
  ): Promise<ThreadMessageListItem[]> {
    await this.assertUserParticipant(threadId, userId);
    return this.messagingRepository.listTaggedMessages(threadId);
  }

  async listGuestThreadTaggedMessages(
    guest: AuthGuest,
  ): Promise<ThreadMessageListItem[]> {
    const threadId = await this.resolveGuestThreadId(guest.id);
    if (!threadId) return [];
    return this.messagingRepository.listTaggedMessages(threadId);
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
    if (!isParticipant) throw AsksynkError.notFound("Thread not found");
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
      throw AsksynkError.notFound("Message not found");
    }
  }

  async canAccessThread(
    identity: WsIdentity,
    threadId: string,
  ): Promise<boolean> {
    if (identity.kind === "user") {
      return this.messagingRepository.isUserParticipant(
        threadId,
        identity.user.id,
      );
    }

    const guestThread = await this.messagingRepository.findGuestThread(
      identity.guest.id,
    );
    return guestThread?.id === threadId;
  }

  @Transactional()
  async createOrGetUserThread(
    userId: string,
    recipientUserId: string,
  ): Promise<Thread> {
    if (userId === recipientUserId) {
      throw AsksynkError.badRequest("Cannot start a thread with yourself");
    }
    const connected = await this.networksService.isActiveConnection(
      userId,
      recipientUserId,
    );

    if (!connected) {
      throw AsksynkError.forbidden("Recipient is not in your network");
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

  @Transactional()
  async sendAsUser(
    senderUserId: string,
    threadId: string,
    body: string,
    tagIds: string[],
    parentMessageId?: string | null,
    attachmentIds: string[] = [],
    taskSuggestion?: TaskSuggestionPayload | null,
  ): Promise<Message> {
    const thread = await this.messagingRepository.getThread(threadId);

    if (!thread) {
      throw AsksynkError.notFound("Thread not found");
    }

    const isParticipant = await this.messagingRepository.isUserParticipant(
      threadId,
      senderUserId,
    );
    if (!isParticipant) {
      throw AsksynkError.notFound("Thread not found");
    }

    await this.assertNotFrozen(thread, senderUserId);

    const sender: MessageSender = { kind: "user", userId: senderUserId };
    const participants =
      await this.messagingRepository.getParticipants(threadId);

    if (tagIds.length > 0) {
      const recipientUserId = this.resolveRecipientUserId(sender, participants);
      if (!recipientUserId) {
        throw AsksynkError.badRequest("Tagging not supported on this message");
      }
      await this.tagsService.assertOwnedBy(recipientUserId, tagIds);
    }

    if (parentMessageId) {
      await this.assertValidReplyParent(threadId, parentMessageId);
    }

    // Authz gate: sender must own each blob, finalized + declared for "message" placement.
    await this.messageAttachmentResolver.assertLinkable(
      attachmentIds,
      senderUserId,
    );

    // Inline task suggestion → a real suggestion for the thread's other user.
    // suggest() enforces the active network connection + tag ownership and opens
    // the suggestee's inbox item. Same tx: message + suggestion commit together.
    let suggestionId: string | null = null;
    if (taskSuggestion) {
      const recipientUserId = this.resolveRecipientUserId(sender, participants);
      if (!recipientUserId) {
        throw AsksynkError.badRequest(
          "Task suggestions are not supported on this thread",
        );
      }
      const suggestion = await this.taskSuggestionsService.suggest({
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

    await this.notifyMessageCreated(message, participants);

    return message;
  }

  @Transactional()
  async sendAsGuest(
    guest: AuthGuest,
    body: string,
    tagIds: string[],
    parentMessageId?: string | null,
  ): Promise<Message> {
    // Guest tags the owner's own tags — they drive the owner's attention item.
    if (tagIds.length > 0) {
      await this.tagsService.assertOwnedBy(guest.ownerUserId, tagIds);
    }

    let thread = await this.messagingRepository.findGuestThread(guest.id);
    if (!thread) {
      thread = await this.messagingRepository.insertThread({
        id: generateId(),
        publicViewId: guest.publicViewId,
      });
      await this.messagingRepository.insertParticipants([
        { threadId: thread.id, userId: guest.ownerUserId, guestId: null },
        { threadId: thread.id, userId: null, guestId: guest.id },
      ]);
    }

    if (parentMessageId) {
      await this.assertValidReplyParent(thread.id, parentMessageId);
    }

    const message = await this.messagingRepository.insertMessage({
      id: generateId(),
      threadId: thread.id,
      parentMessageId: parentMessageId ?? null,
      sender: { kind: "guest", guestId: guest.id },
      body,
      tagIds,
      managedStatus: this.initialManagedStatus(tagIds),
    });

    const participants = await this.messagingRepository.getParticipants(
      thread.id,
    );

    await this.notifyMessageCreated(message, participants);

    return message;
  }

  @Transactional()
  async tagMessage(
    callerUserId: string,
    messageId: string,
    tagIds: string[],
  ): Promise<Message> {
    const message = await this.messagingRepository.getMessageById(messageId);
    if (!message) {
      throw AsksynkError.notFound("Message not found");
    }

    const isParticipant = await this.messagingRepository.isUserParticipant(
      message.threadId,
      callerUserId,
    );

    if (!isParticipant) {
      throw AsksynkError.notFound("Thread not found");
    }

    const participants = await this.messagingRepository.getParticipants(
      message.threadId,
    );

    const recipientUserId = this.resolveRecipientUserId(
      message.sender,
      participants,
    );

    if (!recipientUserId) {
      throw AsksynkError.badRequest("Tagging not supported on this message");
    }

    await this.tagsService.assertOwnedBy(recipientUserId, tagIds);
    await this.messagingRepository.replaceMessageTags(messageId, tagIds);
    await this.reconcileManagedStatus(message.managedStatus, messageId, tagIds);

    const updated = await this.messagingRepository.getMessageById(messageId);
    if (!updated) {
      throw AsksynkError.notFound("Message not found");
    }

    await this.notifyMessageUpdated(updated, participants);

    return updated;
  }

  @Transactional()
  async tagMessageAsGuest(
    guest: AuthGuest,
    messageId: string,
    tagIds: string[],
  ): Promise<Message> {
    const message = await this.messagingRepository.getMessageById(messageId);
    if (!message) {
      throw AsksynkError.notFound("Message not found");
    }

    const thread = await this.messagingRepository.findGuestThread(guest.id);
    if (!thread || thread.id !== message.threadId) {
      throw AsksynkError.notFound("Message not found");
    }

    // Guests re-tag only their own messages; the owner's own messages have no
    // attention-item recipient in a guest thread.
    if (
      message.sender.kind !== "guest" ||
      message.sender.guestId !== guest.id
    ) {
      throw AsksynkError.forbidden("Cannot tag this message");
    }

    await this.tagsService.assertOwnedBy(guest.ownerUserId, tagIds);
    await this.messagingRepository.replaceMessageTags(messageId, tagIds);
    await this.reconcileManagedStatus(message.managedStatus, messageId, tagIds);

    const updated = await this.messagingRepository.getMessageById(messageId);
    if (!updated) {
      throw AsksynkError.notFound("Message not found");
    }

    const participants = await this.messagingRepository.getParticipants(
      message.threadId,
    );

    await this.notifyMessageUpdated(updated, participants);

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
    userId: string,
    messageId: string,
    status: ManagedMessageStatus,
  ): Promise<Message> {
    const message = await this.messagingRepository.getMessageById(messageId);
    if (!message) {
      throw AsksynkError.notFound("Message not found");
    }
    if (!message.managedStatus) {
      throw AsksynkError.badRequest("Message is not manageable");
    }

    const isParticipant = await this.messagingRepository.isUserParticipant(
      message.threadId,
      userId,
    );
    if (!isParticipant) {
      throw AsksynkError.notFound("Thread not found");
    }
    if (message.sender.kind === "user" && message.sender.userId === userId) {
      throw AsksynkError.forbidden(
        "Only the recipient can update this message's status",
      );
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
    threadId: string,
    messageId: string,
    managedStatus: ManagedStatus,
  ): Promise<void> {
    await this.eventsPublisher.publish(MessageManagedStatusChanged, {
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
      throw AsksynkError.notFound("Parent message not found");
    }
    if (parent.isReply()) {
      throw AsksynkError.badRequest("Cannot reply to a reply");
    }
  }

  private async notifyMessageCreated(
    message: Message,
    participants: ThreadParticipantRow[],
  ): Promise<void> {
    const senderId =
      message.sender.kind === "user"
        ? message.sender.userId
        : message.sender.guestId;

    const participantUserIds = participants
      .map((p) => p.userId)
      .filter((id): id is string => !!id);

    const participantGuestIds = participants
      .map((p) => p.guestId)
      .filter((id): id is string => !!id);

    const payload: EventOf<typeof MessageCreated> = {
      threadId: message.threadId,
      message: {
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
      },
      participantUserIds,
      participantGuestIds,
    };

    await this.eventsPublisher.publish(MessageCreated, payload);
  }

  private async notifyMessageUpdated(
    message: Message,
    participants: ThreadParticipantRow[],
  ): Promise<void> {
    const senderId =
      message.sender.kind === "user"
        ? message.sender.userId
        : message.sender.guestId;

    const participantUserIds = participants
      .map((p) => p.userId)
      .filter((id): id is string => !!id);

    const participantGuestIds = participants
      .map((p) => p.guestId)
      .filter((id): id is string => !!id);

    const payload: EventOf<typeof MessageUpdated> = {
      threadId: message.threadId,
      message: {
        id: message.id,
        threadId: message.threadId,
        senderKind: message.sender.kind,
        senderId: senderId,
        body: message.body,
        tagIds: message.tagIds,
        suggestionId: message.suggestionId,
        managedStatus: message.managedStatus ?? undefined,
        createdAt: message.createdAt.toISOString(),
      },
      participantUserIds,
      participantGuestIds,
    };

    await this.eventsPublisher.publish(MessageUpdated, payload);
  }

  private async assertNotFrozen(
    thread: Thread,
    userSenderId: string,
  ): Promise<void> {
    if (thread.isGuestThread()) {
      const view = await this.publicViewsRepository.getById(
        thread.publicViewId!,
      );
      if (!view || !view.isLive()) {
        throw AsksynkError.badRequest("Thread is frozen");
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
      throw AsksynkError.badRequest("Thread is frozen");
    }

    const connected = await this.networksService.isActiveConnection(
      userSenderId,
      otherUser.userId,
    );

    if (!connected) {
      throw AsksynkError.badRequest("Thread is frozen");
    }
  }
}
