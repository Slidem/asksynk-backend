import { Timer } from "@/api/focus/domain/timer";

export abstract class TimersRepository {
  /** Lazily creates the user's idle timer row, then loads it (with its open session). */
  abstract ensure(userId: string): Promise<Timer>;

  abstract getByUserId(userId: string): Promise<Timer | null>;

  /**
   * Writes the touched sessions and the timer if `version` still matches, then
   * publishes recorded events.
   */
  abstract save(timer: Timer): Promise<void>;

  /** Users whose open session sat (not running) past their inactivity timeout as of `now`. */
  abstract findInactiveUserIds(now: Date): Promise<string[]>;
}
