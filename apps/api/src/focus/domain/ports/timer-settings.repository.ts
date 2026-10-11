import { UpdateTimerSettingsInput } from "@/api/focus/domain/timer.model";
import { UserTimerSettings } from "@/api/focus/domain/user-timer-settings";

export abstract class TimerSettingsRepository {
  abstract ensure(userId: string): Promise<UserTimerSettings>;
  abstract update(
    userId: string,
    input: UpdateTimerSettingsInput,
    now: Date,
  ): Promise<UserTimerSettings>;
}
