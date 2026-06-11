import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Query,
  Res,
} from "@nestjs/common";
import { Response } from "express";

import { AuthUser as AuthUserType } from "@/api/auth/auth.types";
import { AuthUser } from "@/api/auth/authUser.decorator";
import { Public } from "@/api/auth/public.decorator";
import { toCalendarIntegrationResponseDto } from "@/api/calendar-integrations/rest/calendar-integration.mapper";
import { UpdateIntegrationRequestDto } from "@/api/calendar-integrations/rest/dto/update-integration.dto";
import {
  AuthUrlResponseDto,
  CalendarIntegrationResponseDto,
} from "@/api/calendar-integrations/rest/responses/calendar-integration.response";
import { CalendarIntegrationService } from "@/api/calendar-integrations/services/calendar-integration.service";
import { UuidV7Param } from "@/api/common/decorators/param.decorators";

@Controller()
export class CalendarIntegrationsController {
  constructor(
    private readonly integrationService: CalendarIntegrationService,
  ) {}

  @Get("calendar-integrations/auth-url")
  getAuthUrl(
    @Query("provider") provider: string,
    @AuthUser() user: AuthUserType,
  ): AuthUrlResponseDto {
    return { url: this.integrationService.getAuthUrl(user.id, provider) };
  }

  @Public()
  @Get("calendar-integrations/:provider/callback")
  async handleCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
  ): Promise<void> {
    const redirectUrl = await this.integrationService.handleOAuthCallback(
      code,
      state,
    );
    res.redirect(redirectUrl);
  }

  @Get("calendar-integrations")
  async list(
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarIntegrationResponseDto[]> {
    const integrations = await this.integrationService.listIntegrations(
      user.id,
    );
    return integrations.map(toCalendarIntegrationResponseDto);
  }

  @Get("calendar-integrations/:id")
  async get(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarIntegrationResponseDto> {
    const integration = await this.integrationService.getIntegration(
      user.id,
      id,
    );
    return toCalendarIntegrationResponseDto(integration);
  }

  @Patch("calendar-integrations/:id")
  async update(
    @UuidV7Param("id") id: string,
    @Body() dto: UpdateIntegrationRequestDto,
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarIntegrationResponseDto> {
    const integration = await this.integrationService.updateIntegration({
      userId: user.id,
      integrationId: id,
      syncDirection: dto.syncDirection,
      calendars: dto.calendars,
    });
    return toCalendarIntegrationResponseDto(integration);
  }

  @Delete("calendar-integrations/:id")
  @HttpCode(204)
  async disconnect(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.integrationService.disconnect(user.id, id);
  }
}
