/**
 *  Checks if a given string is a valid ISO 8601 date with an offset (e.g., "2023-03-15T12:30:00+02:00" or "2023-03-15T12:30:00Z").
 *
 * @param value
 * @returns true if the string is a valid ISO 8601 date with an offset, false otherwise.
 */
export function isIsoDateWithOffset(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/.test(value)) {
    return false;
  }
  return !isNaN(new Date(value).getTime());
}

/**
 * Checks if a given string is a valid IANA timezone (e.g., "Europe/Bucharest").
 *
 * @param tz
 * @returns true if the string is a valid IANA timezone, false otherwise.
 */
export function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
