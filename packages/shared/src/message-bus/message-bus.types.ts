export type MessageHandler<T> = (data: T) => Promise<void>;

export type SendOptions = {
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  startAfter?: number | Date | string;
  expireInSeconds?: number;
  priority?: number;
  singletonKey?: string;
  singletonSeconds?: number;
};

export type WorkOptions = {
  pollingIntervalSeconds?: number;
  batchSize?: number;
  localConcurrency?: number;
};
