import { Actor } from "@/api/kernel/actor/actor";

// What other contexts may ask the network: are two users connected, and whose
// data may an actor read.
export abstract class ConnectionPolicyPort {
  abstract areConnected(userIdA: string, userIdB: string): Promise<boolean>;

  // The subset of `otherUserIds` actively connected to `userId`.
  abstract connectedAmong(
    userId: string,
    otherUserIds: string[],
  ): Promise<Set<string>>;

  // Throws `networks.network_connection_not_found` unless connected.
  abstract assertConnected(userIdA: string, userIdB: string): Promise<void>;

  // Guests read their link owner's data; users read their own, or a connected
  // user's when `requestedUserId` is given.
  abstract resolveTargetUserId(
    actor: Actor,
    requestedUserId?: string,
  ): Promise<string>;
}
