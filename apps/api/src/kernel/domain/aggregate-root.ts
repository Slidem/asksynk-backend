/**
 * Base for aggregates that own a state machine (ADR 0008). Methods mutate state and
 * `record` domain events; the repository's `save` checks `version`, calls
 * `markSaved`, and flushes `pullEvents()` to the outbox in the same tx.
 */
export abstract class AggregateRoot<E> {
  private events: E[] = [];

  /** 0 = never saved; stored rows start at 1. */
  protected constructor(private _version: number) {}

  get version(): number {
    return this._version;
  }

  protected record(event: E): void {
    this.events.push(event);
  }

  /** Returns recorded events and clears them. */
  pullEvents(): E[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** Repositories only: call after a successful write. */
  markSaved(): void {
    this._version += 1;
  }
}
