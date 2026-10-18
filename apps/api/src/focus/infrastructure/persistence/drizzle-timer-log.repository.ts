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
      transition: entry.transition,
      sessionType: entry.sessionType,
      sessionDurationSeconds: entry.sessionDurationSeconds,
      remainingSeconds: entry.remainingSeconds,
      occurredAt: entry.occurredAt,
    });
  }
}
