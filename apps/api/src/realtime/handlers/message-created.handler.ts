import { EventConsumer } from "@/shared/event-consumer/event-consumer.decorator";
import { EventConsumerHandler } from "@/shared/event-consumer/event-consumer.types";
import { MessageCreated } from "@/shared/event-registry/events.registry";
import { EventOf } from "@/shared/event-registry/events.types";

import { WsBroadcaster } from "../services/ws-broadcaster.service";
import { guestRoom, threadRoom, userRoom } from "../ws.rooms";

@EventConsumer({ event: MessageCreated })
export class MessageCreatedBroadcastHandler implements EventConsumerHandler<
  typeof MessageCreated
> {
  constructor(private readonly wsBroadcaster: WsBroadcaster) {}

  async handle(payload: EventOf<typeof MessageCreated>): Promise<void> {
    const rooms = new Set<string>([threadRoom(payload.threadId)]);

    for (const userId of payload.participantUserIds) {
      rooms.add(userRoom(userId));
    }

    for (const guestId of payload.participantGuestIds) {
      rooms.add(guestRoom(guestId));
    }

    this.wsBroadcaster.emit([...rooms], "message.created", {
      threadId: payload.threadId,
      message: payload.message,
    });
  }
}
