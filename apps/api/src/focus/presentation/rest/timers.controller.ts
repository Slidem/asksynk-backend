import { Body, Controller, Get, Patch, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { TimersService } from "@/api/focus/application/timers.service";
import { PatchTimerDto } from "@/api/focus/presentation/rest/dto/patch-timer.dto";
import { UpdateTimerSettingsDto } from "@/api/focus/presentation/rest/dto/update-timer-settings.dto";
import { BreakSuggestionResponse } from "@/api/focus/presentation/rest/responses/break-suggestion.response";
import { TimerResponse } from "@/api/focus/presentation/rest/responses/timer.response";
import { TimerSettingsResponse } from "@/api/focus/presentation/rest/responses/timer-settings.response";
import {
  toBreakSuggestionResponse,
  toTimerResponse,
  toTimerSettingsResponse,
} from "@/api/focus/presentation/rest/timers.mapper";
import { Actor } from "@/api/kernel/actor/actor";
import { Clock } from "@/api/platform/clock/clock";
import { ApiStandardErrors } from "@/api/platform/errors/swagger.decorator";
import { RequestActor } from "@/api/platform/http/auth/request-actor.decorator";

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
  async getCurrent(@RequestActor() actor: Actor): Promise<TimerResponse> {
    const timer = await this.timersService.getCurrent(actor);
    return toTimerResponse(timer, this.clock.now());
  }

  /** Start, pause, resume, or stop the current user's timer */
  @Patch()
  async transition(
    @Body() body: PatchTimerDto,
    @RequestActor() actor: Actor,
  ): Promise<TimerResponse> {
    const timer = await this.timersService.applyTransition(actor, {
      status: body.status,
      sessionType: body.sessionType,
      durationSeconds: body.durationSeconds,
    });

    return toTimerResponse(timer, this.clock.now());
  }

  /** Get the current user's timer settings */
  @Get("settings")
  async getSettings(
    @RequestActor() actor: Actor,
  ): Promise<TimerSettingsResponse> {
    const settings = await this.timersService.getSettings(actor);
    return toTimerSettingsResponse(settings);
  }

  /** Replace the current user's timer settings */
  @Put("settings")
  async updateSettings(
    @Body() body: UpdateTimerSettingsDto,
    @RequestActor() actor: Actor,
  ): Promise<TimerSettingsResponse> {
    const settings = await this.timersService.updateSettings(actor, {
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
    @RequestActor() actor: Actor,
  ): Promise<BreakSuggestionResponse> {
    const suggestion = await this.timersService.getSuggestion(actor);
    return toBreakSuggestionResponse(suggestion);
  }
}
