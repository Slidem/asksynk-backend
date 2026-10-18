import { Timer } from "@/api/focus/domain/timer";

export abstract class TimersRepository {
  /** Lazily creates the user's idle timer row, then loads it. */
  abstract ensure(userId: string): Promise<Timer>;

  abstract getByUserId(userId: string): Promise<Timer | null>;

  /** Writes the full state if `version` still matches, then publishes recorded events. */
  abstract save(timer: Timer): Promise<void>;
}
