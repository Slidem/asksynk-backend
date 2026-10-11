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
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { Response } from "express";

import { UuidV7Param } from "@/api/platform/decorators/paramValidators.decorators";
import { ApiStandardErrors } from "@/api/platform/errors/swagger.decorator";
import { AuthUser as AuthUserType } from "@/api/platform/http/auth/auth.types";
import { AuthUser } from "@/api/platform/http/auth/auth-user.decorator";
import { Public } from "@/api/platform/http/auth/public.decorator";
import { CalendarIntegrationService } from "@/api/scheduling/application/calendar-integration.service";
import { toCalendarIntegrationResponseDto } from "@/api/scheduling/presentation/rest/calendar-integration.mapper";
import { UpdateIntegrationRequestDto } from "@/api/scheduling/presentation/rest/dto/update-integration.dto";
import {
  AuthUrlResponseDto,
  CalendarIntegrationResponseDto,
} from "@/api/scheduling/presentation/rest/responses/calendar-integration.response";

@ApiTags("Calendar Integrations")
@ApiBearerAuth("bearer")
@ApiStandardErrors()
@Controller()
export class CalendarIntegrationsController {
  constructor(
    private readonly integrationService: CalendarIntegrationService,
  ) {}

  /** Get the provider OAuth authorization URL to start connecting a calendar */
  @Get("calendar-integrations/auth-url")
  getAuthUrl(
    @Query("provider") provider: string,
    @AuthUser() user: AuthUserType,
  ): AuthUrlResponseDto {
    return { url: this.integrationService.getAuthUrl(user.id, provider) };
  }

  @ApiExcludeEndpoint()
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

  /** List the current user's connected calendar integrations */
  @Get("calendar-integrations")
  async list(
    @AuthUser() user: AuthUserType,
  ): Promise<CalendarIntegrationResponseDto[]> {
    const integrations = await this.integrationService.listIntegrations(
      user.id,
    );
    return integrations.map(toCalendarIntegrationResponseDto);
  }

  /** Get a single calendar integration by id */
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

  /** Update an integration's sync direction or per-calendar sync selection */
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

  /** Disconnect (delete) a calendar integration */
  @Delete("calendar-integrations/:id")
  @HttpCode(204)
  async disconnect(
    @UuidV7Param("id") id: string,
    @AuthUser() user: AuthUserType,
  ): Promise<void> {
    await this.integrationService.disconnect(user.id, id);
  }
}
