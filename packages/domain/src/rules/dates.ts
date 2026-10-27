/**
 * Date helpers. The API, generator and UI must never derive "today" with
 * `toISOString()`: that returns the UTC date and is wrong after 22:00/23:00
 * Italian time. Always go through the athlete's timezone.
 */

export const DEFAULT_TIME_ZONE = "Europe/Rome";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns a usable IANA timezone. Stored baselines may be missing or carry an
 * invalid value, so every caller falls back to the personal default instead of
 * throwing.
 */
export function resolveTimeZone(timeZone?: string | null): string {
  if (timeZone && isValidTimeZone(timeZone)) return timeZone;
  return DEFAULT_TIME_ZONE;
}

/** Adds days to an ISO calendar date (date-only arithmetic, no timezone drift). */
export function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Formats an instant as YYYY-MM-DD in the given IANA timezone. */
export function localDate(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const read = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${read("year")}-${read("month")}-${read("day")}`;
}

/** Today's calendar date in the athlete's timezone. */
export function todayLocalDate(timeZone: string, now = new Date()): string {
  return localDate(now, timeZone);
}
