import { UserTimerSettings } from "@/api/timers/entities/user-timer-settings.entity";
import { UpdateTimerSettingsInput } from "@/api/timers/models/timer.model";

export abstract class TimerSettingsRepository {
  abstract ensure(userId: string): Promise<UserTimerSettings>;
  abstract update(
    userId: string,
    input: UpdateTimerSettingsInput,
    now: Date,
  ): Promise<UserTimerSettings>;
}
