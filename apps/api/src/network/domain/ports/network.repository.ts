import { NetworkConnection } from "@/api/network/domain/network-connection";

export abstract class NetworkRepository {
  abstract upsertPair(userIdA: string, userIdB: string): Promise<void>;
  abstract softRemovePair(userIdA: string, userIdB: string): Promise<void>;
  abstract listActiveConnections(userId: string): Promise<NetworkConnection[]>;
  abstract connectedAmong(
    userId: string,
    otherUserIds: string[],
  ): Promise<Set<string>>;
  abstract isActiveConnection(userIdA: string, userIdB: string): Promise<boolean>;
}
