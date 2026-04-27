import { Injectable } from "@nestjs/common";
import { Transactional } from "@nestjs-cls/transactional";

import { AuthGuest } from "@/api/auth/auth.types";
import { AsksynkError } from "@/api/common/errors/errors.model";
import { Message } from "@/api/messaging/entities/message.entity";
import { Thread } from "@/api/messaging/entities/thread.entity";
import {
  MessagingRepository,
  ThreadListItem,
} from "@/api/messaging/repositories/messaging.repository";
import { NetworksService } from "@/api/networks/services/networks.service";
import { PublicViewsRepository } from "@/api/public-views/repositories/public-views.repository";
import { generateId } from "@/shared/id";

const MAX_MESSAGE_LIMIT = 100;

@Injectable()
export class MessagingService {
  constructor(
    private readonly messagingRepository: MessagingRepository,
    private readonly networksService: NetworksService,
    private readonly publicViewsRepository: PublicViewsRepository,
  ) {}

  async listThreadsForUser(userId: string): Promise<ThreadListItem[]> {
    return this.messagingRepository.listThreadsForUser(userId);
  }

  async listThreadMessages(
    userId: string,
    threadId: string,
    options: { before?: Date; limit?: number },
  ): Promise<Message[]> {
    const isParticipant = await this.messagingRepository.isUserParticipant(
      threadId,
      userId,
    );
    if (!isParticipant) throw AsksynkError.notFound("Thread not found");
    return this.messagingRepository.listMessages(threadId, {
      before: options.before,
      limit: Math.min(options.limit ?? 50, MAX_MESSAGE_LIMIT),
    });
  }

  async listGuestThreadMessages(
    guest: AuthGuest,
    options: { before?: Date; limit?: number },
  ): Promise<Message[]> {
    const thread = await this.messagingRepository.findGuestThread(guest.id);
    if (!thread) return [];
    return this.messagingRepository.listMessages(thread.id, {
      before: options.before,
      limit: Math.min(options.limit ?? 50, MAX_MESSAGE_LIMIT),
    });
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
    if (existing) return existing;

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
  ): Promise<Message> {
    const thread = await this.messagingRepository.getThread(threadId);
    if (!thread) throw AsksynkError.notFound("Thread not found");

    const isParticipant = await this.messagingRepository.isUserParticipant(
      threadId,
      senderUserId,
    );
    if (!isParticipant) throw AsksynkError.notFound("Thread not found");

    await this.assertNotFrozen(thread, senderUserId);

    return this.messagingRepository.insertMessage({
      id: generateId(),
      threadId,
      sender: { kind: "user", userId: senderUserId },
      body,
    });
  }

  @Transactional()
  async sendAsGuest(guest: AuthGuest, body: string): Promise<Message> {
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

    return this.messagingRepository.insertMessage({
      id: generateId(),
      threadId: thread.id,
      sender: { kind: "guest", guestId: guest.id },
      body,
    });
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
