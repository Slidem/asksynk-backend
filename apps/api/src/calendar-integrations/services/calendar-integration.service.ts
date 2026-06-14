import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Transactional } from "@nestjs-cls/transactional";
import { ContextLogger } from "nestjs-context-logger";

import { Calendar } from "@/api/calendar-events/entities/calendar.entity";
import { CalendarRepository } from "@/api/calendar-events/repositories/calendar.repository";
import { CalendarEventsRepository } from "@/api/calendar-events/repositories/calendar-events.repository";
import { CalendarIntegration } from "@/api/calendar-integrations/entities/calendar-integration.entity";
import { IntegrationWithCalendars } from "@/api/calendar-integrations/models/integration-with-calendars.model";
import { UpdateIntegrationInput } from "@/api/calendar-integrations/models/update-integration.model";
import { CalendarProviderRegistry } from "@/api/calendar-integrations/providers/calendar-provider.registry";
import { ProviderCredentials } from "@/api/calendar-integrations/providers/types";
import { CalendarEventLinkRepository } from "@/api/calendar-integrations/repositories/calendar-event-link.repository";
import { CalendarIntegrationRepository } from "@/api/calendar-integrations/repositories/calendar-integration.repository";
import {
  signOAuthState,
  verifyOAuthState,
} from "@/api/calendar-integrations/utils/oauth-state.util";
import { AsksynkError } from "@/api/common/errors/errors.model";
import { generateId } from "@/shared/id";

@Injectable()
export class CalendarIntegrationService {
  private readonly logger = new ContextLogger(CalendarIntegrationService.name);

  constructor(
    private readonly registry: CalendarProviderRegistry,
    private readonly integrationRepository: CalendarIntegrationRepository,
    private readonly calendarRepository: CalendarRepository,
    private readonly calendarEventsRepository: CalendarEventsRepository,
    private readonly linkRepository: CalendarEventLinkRepository,
    private readonly config: ConfigService,
  ) {}

  /** Build the provider consent URL the frontend redirects the user to. */
  getAuthUrl(userId: string, provider: string): string {
    const providerImpl = this.registry.get(provider);
    const state = signOAuthState(
      { userId, provider },
      this.config.getOrThrow<string>("AUTH_SECRET"),
    );
    return providerImpl.getAuthUrl(state);
  }

  /**
   * OAuth redirect target. Exchanges the code, persists the integration and its
   * provider calendars (sync disabled until the user opts in), returns the
   * frontend URL to redirect to.
   */
  @Transactional()
  async handleOAuthCallback(code: string, state: string): Promise<string> {
    const parsed = verifyOAuthState(
      state,
      this.config.getOrThrow<string>("AUTH_SECRET"),
    );
    if (!parsed) {
      throw AsksynkError.badRequest("Invalid OAuth state");
    }

    const provider = this.registry.get(parsed.provider);
    const exchange = await provider.exchangeCode(code);

    const integration = await this.integrationRepository.add(
      CalendarIntegration.create({
        id: generateId(),
        userId: parsed.userId,
        provider: parsed.provider,
        externalAccountId: exchange.externalAccountId,
        status: "active",
        syncDirection: "readonly",
        credentials: exchange.credentials,
        providerData: { accountEmail: exchange.accountEmail },
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const externalCalendars = await provider.listCalendars(
      exchange.credentials,
    );
    for (const ext of externalCalendars) {
      await this.calendarRepository.add(
        Calendar.create({
          id: generateId(),
          userId: parsed.userId,
          source: parsed.provider,
          name: ext.name,
          color: ext.color,
          externalId: ext.externalId,
          integrationId: integration.id,
          syncEnabled: false,
          syncToken: null,
          providerState: {
            timezone: ext.timezone ?? undefined,
            isPrimary: ext.primary,
          },
          createdAt: new Date(),
        }),
      );
    }

    const redirectUrl = new URL(
      this.config.getOrThrow<string>("CALENDAR_OAUTH_REDIRECT_URL"),
    );
    redirectUrl.searchParams.set("connected", parsed.provider);
    return redirectUrl.toString();
  }

  @Transactional()
  async listIntegrations(userId: string): Promise<IntegrationWithCalendars[]> {
    const integrations = await this.integrationRepository.listByUser(userId);
    const result: IntegrationWithCalendars[] = [];
    for (const integration of integrations) {
      const calendars = await this.calendarRepository.listByIntegration(
        integration.id,
      );
      result.push({ integration, calendars });
    }
    return result;
  }

  @Transactional()
  async getIntegration(
    userId: string,
    integrationId: string,
  ): Promise<IntegrationWithCalendars> {
    const integration = await this.requireOwned(userId, integrationId);
    const calendars = await this.calendarRepository.listByIntegration(
      integration.id,
    );
    return { integration, calendars };
  }

  @Transactional()
  async updateIntegration(
    input: UpdateIntegrationInput,
  ): Promise<IntegrationWithCalendars> {
    const integration = await this.requireOwned(
      input.userId,
      input.integrationId,
    );

    if (input.syncDirection) {
      await this.integrationRepository.updateSyncDirection(
        integration.id,
        input.syncDirection,
      );
      integration.syncDirection = input.syncDirection;
    }

    if (input.calendars?.length) {
      const owned = await this.calendarRepository.listByIntegration(
        integration.id,
      );
      const ownedById = new Map(owned.map((c) => [c.id, c] as const));
      for (const selection of input.calendars) {
        const calendar = ownedById.get(selection.calendarId);
        if (!calendar) {
          throw AsksynkError.badRequest(
            "Calendar does not belong to this integration",
          );
        }
        // disabling a previously-synced calendar: drop its imported events
        if (!selection.syncEnabled && calendar.syncEnabled) {
          await this.purgeImportedEvents(calendar);
        }
        await this.calendarRepository.setSyncEnabled(
          selection.calendarId,
          selection.syncEnabled,
        );
      }
    }

    const calendars = await this.calendarRepository.listByIntegration(
      integration.id,
    );
    return { integration, calendars };
  }

  /** Drops a provider calendar's imported events, links, and sync cursor. */
  private async purgeImportedEvents(calendar: Calendar): Promise<void> {
    await this.linkRepository.deleteImportedByCalendar(
      calendar.integrationId!,
      calendar.externalId!,
    );
    await this.calendarEventsRepository.deleteByCalendar(calendar.id);
    await this.calendarRepository.updateSyncToken(calendar.id, null);
  }

  @Transactional()
  async disconnect(userId: string, integrationId: string): Promise<void> {
    const integration = await this.requireOwned(userId, integrationId);
    const provider = this.registry.get(integration.provider);
    // best-effort external revoke; deletion cascades to calendars/events/links
    await provider.revoke(integration.credentials);
    await this.integrationRepository.delete(integration.id);
  }

  /**
   * Returns credentials guaranteed fresh, refreshing+persisting under a row lock
   * if the access token is near expiry. Used by the sync engine. On refresh
   * failure the integration is marked `error` so polling backs off.
   */
  @Transactional()
  async getFreshCredentials(
    integrationId: string,
  ): Promise<{ integration: CalendarIntegration; credentials: ProviderCredentials }> {
    const integration =
      await this.integrationRepository.getByIdForUpdate(integrationId);
    if (!integration) {
      throw AsksynkError.notFound("Calendar integration not found");
    }

    if (!integration.accessTokenExpired(new Date())) {
      return { integration, credentials: integration.credentials };
    }

    const provider = this.registry.get(integration.provider);
    try {
      const refreshed = await provider.refreshCredentials(
        integration.credentials,
      );
      await this.integrationRepository.updateCredentials(
        integration.id,
        refreshed,
      );
      integration.credentials = refreshed;
      return { integration, credentials: refreshed };
    } catch (err) {
      this.logger.error("Failed to refresh provider credentials", {
        integrationId,
        err,
      });
      await this.integrationRepository.updateStatus(
        integration.id,
        "error",
        "Failed to refresh credentials; reconnect required",
      );
      throw AsksynkError.badRequest("Calendar integration needs reconnection");
    }
  }

  private async requireOwned(
    userId: string,
    integrationId: string,
  ): Promise<CalendarIntegration> {
    const integration = await this.integrationRepository.getOwned(
      integrationId,
      userId,
    );
    if (!integration) {
      throw AsksynkError.notFound("Calendar integration not found");
    }
    return integration;
  }
}
