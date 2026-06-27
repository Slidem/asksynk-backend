import { Body, Controller, Get, Patch, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { Clock } from "@/api/common/clock/clock";
import { ApiStandardErrors } from "@/api/common/errors/api-error-responses.decorator";
import { PatchTimerDto } from "@/api/timers/rest/dto/patch-timer.dto";
import { UpdateTimerSettingsDto } from "@/api/timers/rest/dto/update-timer-settings.dto";
import { BreakSuggestionResponse } from "@/api/timers/rest/responses/break-suggestion.response";
import { TimerResponse } from "@/api/timers/rest/responses/timer.response";
import { TimerSettingsResponse } from "@/api/timers/rest/responses/timer-settings.response";
import {
  toBreakSuggestionResponse,
  toTimerResponse,
  toTimerSettingsResponse,
} from "@/api/timers/rest/timers.mapper";
import { TimersService } from "@/api/timers/timers.service";

@ApiTags("Timers")
@ApiBearerAuth("bearer")
@ApiStandardErrors()
@Controller("timers")
export class TimersController {
  constructor(
    private readonly timersService: TimersService,
    private readonly clock: Clock,
  ) {}

  /** Get the current user's timer */
  @Get()
  async getCurrent(@AuthUser() user: AuthUserType): Promise<TimerResponse> {
    const timer = await this.timersService.getCurrent(user.id);
    return toTimerResponse(timer, this.clock.now());
  }

  /** Start, pause, resume, or stop the current user's timer */
  @Patch()
  async transition(
    @Body() body: PatchTimerDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TimerResponse> {
    const timer = await this.timersService.applyTransition(user.id, {
      status: body.status,
      sessionType: body.sessionType,
      durationSeconds: body.durationSeconds,
    });
    return toTimerResponse(timer, this.clock.now());
  }

  /** Get the current user's timer settings */
  @Get("settings")
  async getSettings(
    @AuthUser() user: AuthUserType,
  ): Promise<TimerSettingsResponse> {
    const settings = await this.timersService.getSettings(user.id);
    return toTimerSettingsResponse(settings);
  }

  /** Replace the current user's timer settings */
  @Put("settings")
  async updateSettings(
    @Body() body: UpdateTimerSettingsDto,
    @AuthUser() user: AuthUserType,
  ): Promise<TimerSettingsResponse> {
    const settings = await this.timersService.updateSettings(user.id, {
      focusDurationSeconds: body.focusDurationSeconds,
      shortBreakDurationSeconds: body.shortBreakDurationSeconds,
      longBreakDurationSeconds: body.longBreakDurationSeconds,
      longBreakInterval: body.longBreakInterval,
    });
    return toTimerSettingsResponse(settings);
  }

  /** Get a break suggestion based on completed focus sessions */
  @Get("suggestion")
  async getSuggestion(
    @AuthUser() user: AuthUserType,
  ): Promise<BreakSuggestionResponse> {
    const suggestion = await this.timersService.getSuggestion(user.id);
    return toBreakSuggestionResponse(suggestion);
  }
}
