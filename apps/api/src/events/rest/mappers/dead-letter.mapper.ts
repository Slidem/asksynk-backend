import { DeadLetterResponse } from "@/api/events/rest/responses/dead-letter.response";
import { DeadLetter } from "@/api/platform/events/dead-letters/events-dead-letters.repository";

export function toDeadLetterResponse(row: DeadLetter): DeadLetterResponse {
  return {
    id: row.id,
    consumerGroup: row.consumerGroup,
    eventId: row.eventId,
    eventType: row.eventType,
    payload: row.payload,
    error: row.error,
    attempts: row.attempts,
    status: row.status,
    replayCount: row.replayCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
