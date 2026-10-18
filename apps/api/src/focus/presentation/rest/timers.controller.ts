import { Body, Controller, Get, Header, Patch, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { TimersService } from "@/api/focus/application/timers.service";
import { TimerCommandDto } from "@/api/focus/presentation/rest/dto/timer-command.dto";
import { UpdateTimerSettingsDto } from "@/api/focus/presentation/rest/dto/update-timer-settings.dto";
import { TimerResponse } from "@/api/focus/presentation/rest/responses/timer.response";
import { TimerSettingsResponse } from "@/api/focus/presentation/rest/responses/timer-settings.response";
import { TimerTransitionsResponse } from "@/api/focus/presentation/rest/responses/timer-transitions.response";
import {
  toTimerResponse,
  toTimerSettingsResponse,
  toTimerTransitionsResponse,
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

  /** Control the current user's timer: start (with a mode), pause, resume, stop, or reset the session */
  @Patch()
  async command(
    @Body() body: TimerCommandDto,
    @RequestActor() actor: Actor,
  ): Promise<TimerResponse> {
    const timer = await this.timersService.command(actor, {
      command: body.command,
      mode: body.mode,
    });
    return toTimerResponse(timer, this.clock.now());
  }

  /** Get the timer state machine: every allowed transition, the same for all users and states */
  @Get("transitions")
  @Header("Cache-Control", "private, max-age=3600")
  getTransitions(@RequestActor() actor: Actor): TimerTransitionsResponse {
    return toTimerTransitionsResponse(this.timersService.getTransitions(actor));
  }

  /** Get the current user's timer settings */
  @Get("settings")
  async getSettings(
    @RequestActor() actor: Actor,
  ): Promise<TimerSettingsResponse> {
    const settings = await this.timersService.getSettings(actor);
    return toTimerSettingsResponse(settings);
  }

  /** Replace the current user's timer settings; ends the open session if durations or the interval change */
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
      inactivityTimeoutSeconds: body.inactivityTimeoutSeconds,
    });
    return toTimerSettingsResponse(settings);
  }
}
