import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  localDate,
  resolveTimeZone,
  todayLocalDate,
} from "./dates";

describe("dates", () => {
  it("uses the athlete timezone instead of UTC", () => {
    expect(localDate(new Date("2026-10-27T23:30:00Z"), "Europe/Rome")).toBe("2026-10-28");
    expect(localDate(new Date("2026-10-27T21:30:00Z"), "Europe/Rome")).toBe("2026-10-27");
  });

  it("handles timezones west of UTC", () => {
    expect(localDate(new Date("2026-10-27T02:30:00Z"), "America/New_York")).toBe("2026-10-26");
  });

  it("exposes today in the requested timezone", () => {
    const now = new Date("2026-10-27T23:30:00Z");
    expect(todayLocalDate("Europe/Rome", now)).toBe("2026-10-28");
    expect(todayLocalDate("Europe/London", now)).toBe("2026-10-27");
  });

  it("falls back to the personal default for missing or invalid timezones", () => {
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone("Not/AZone")).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone("America/New_York")).toBe("America/New_York");
  });

  it("validates IANA timezones", () => {
    expect(isValidTimeZone("Europe/Rome")).toBe(true);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("Europe/Nowhere")).toBe(false);
  });

  it("adds days to date-only values without DST drift", () => {
    expect(addDaysIso("2026-10-27", 1)).toBe("2026-10-28");
    expect(addDaysIso("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysIso("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
  });
});
