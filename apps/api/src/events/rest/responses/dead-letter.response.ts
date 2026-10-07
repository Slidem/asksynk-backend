export class DeadLetterResponse {
  id!: string;
  consumerGroup!: string;
  eventId!: string;
  eventType!: string;
  payload!: unknown;
  error!: string;
  attempts!: number;
  status!: string;
  replayCount!: number;
  createdAt!: string;
  updatedAt!: string;
}

export class DeadLetterSkipResponse {
  id!: string;
  reason!: string;
}

export class DeadLetterTransitionResponse {
  updated!: string[];
  skipped!: DeadLetterSkipResponse[];
}
