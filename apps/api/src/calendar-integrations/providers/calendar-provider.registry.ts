import { Injectable } from "@nestjs/common";

import { CalendarProvider } from "@/api/calendar-integrations/providers/calendar-provider";
import { GoogleCalendarProvider } from "@/api/calendar-integrations/providers/google-calendar.provider";
import { AsksynkError } from "@/api/common/errors/errors.model";

/**
 * Resolves a {@link CalendarProvider} by its `provider` discriminator. Adding a
 * new provider = inject it here and register it.
 */
@Injectable()
export class CalendarProviderRegistry {
  private readonly byName = new Map<string, CalendarProvider>();

  constructor(google: GoogleCalendarProvider) {
    this.register(google);
  }

  get(provider: string): CalendarProvider {
    const found = this.byName.get(provider);
    if (!found) {
      throw AsksynkError.badRequest(
        `Unsupported calendar provider: ${provider}`,
      );
    }
    return found;
  }

  list(): CalendarProvider[] {
    return [...this.byName.values()];
  }

  private register(provider: CalendarProvider): void {
    this.byName.set(provider.provider, provider);
  }
}
