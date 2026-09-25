import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";

import { TxAdapter } from "@/api/platform/db/tx.module";
import { eventsDeadLetters } from "@/migrations/schema/eventsDeadLetters";

export interface RecordDeadLetterInput {
  consumerGroup: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  error: string;
  attempts: number;
}

@Injectable()
export class EventsDeadLettersRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {}

  /**
   * Idempotent on (eventId, consumerGroup): a crash between this insert and the
   * job completing re-runs the terminal attempt, which must not duplicate.
   */
  async record(input: RecordDeadLetterInput): Promise<void> {
    await this.txHost.tx
      .insert(eventsDeadLetters)
      .values(input)
      .onConflictDoNothing();
  }
}
