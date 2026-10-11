import { calendarIntegrationError } from "@/api/scheduling/calendar-integration.errors";
import { CalendarProvider } from "@/api/scheduling/domain/ports/calendar-provider";

/**
 * Resolves a {@link CalendarProvider} by its `provider` discriminator. Adding a
 * new provider = add it to the factory in scheduling.module.ts.
 */
export class CalendarProviderRegistry {
  private readonly byName = new Map<string, CalendarProvider>();

  constructor(providers: CalendarProvider[]) {
    providers.forEach((p) => this.register(p));
  }

  get(provider: string): CalendarProvider {
    const found = this.byName.get(provider);
    if (!found) {
      throw calendarIntegrationError("unsupported_provider", { provider });
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
