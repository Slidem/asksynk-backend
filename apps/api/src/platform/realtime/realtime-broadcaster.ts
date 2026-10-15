export type RealtimeTarget =
  | { kind: "user"; id: string }
  | { kind: "guest"; id: string }
  | { kind: "thread"; id: string };

export const roomOf = (target: RealtimeTarget): string =>
  `${target.kind}:${target.id}`;

/**
 * Pushes an event to connected clients. One call per event: the transport dedupes
 * sockets across all targets, so a socket in several target rooms receives it once.
 */
export abstract class RealtimeBroadcaster {
  abstract emit(
    targets: RealtimeTarget[],
    event: string,
    payload: unknown,
  ): void;
}
