import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";

import {
  TimerLogEntry,
  TimerLogRepository,
} from "@/api/focus/domain/ports/timer-log.repository";
import { TxAdapter } from "@/api/platform/db/tx.module";
import { userTimerLog } from "@/migrations/schema/userTimerLog";

@Injectable()
export class DrizzleTimerLogRepository extends TimerLogRepository {
  constructor(private readonly txHost: TransactionHost<TxAdapter>) {
    super();
  }

  async append(entry: TimerLogEntry): Promise<void> {
    await this.txHost.tx.insert(userTimerLog).values({
      userId: entry.userId,
      sessionId: entry.sessionId,
      transition: entry.transition,
      mode: entry.mode,
      durationSeconds: entry.durationSeconds,
      remainingSeconds: entry.remainingSeconds,
      reason: entry.reason,
      occurredAt: entry.occurredAt,
    });
  }
}
