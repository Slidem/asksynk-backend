export type PublicLinkSummary = {
  publicViewId: string;
  name: string | null;
  live: boolean;
};

export type GuestSummary = {
  guestId: string;
  publicViewId: string;
  displayName: string;
};

// What other contexts may ask sharing: is a public link still live, and who are
// its visitors. Missing ids are absent from the returned maps.
export abstract class PublicLinkPort {
  abstract isLive(publicViewId: string): Promise<boolean>;
  abstract getLinkSummaries(
    publicViewIds: string[],
  ): Promise<Map<string, PublicLinkSummary>>;
  abstract getGuestSummaries(
    guestIds: string[],
  ): Promise<Map<string, GuestSummary>>;
}
