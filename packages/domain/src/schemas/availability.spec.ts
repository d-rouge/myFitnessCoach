import { describe, expect, it } from "vitest";
import {
  AvailabilitySchema,
  LONG_SESSION_MAX_MIN,
  NORMAL_SESSION_MAX_MIN,
  normalizeAvailability,
  resolveAvailabilityDays,
} from "./availability";

describe("resolveAvailabilityDays", () => {
  it("sceglie il numero di giorni richiesto e distribuisce le sedute", () => {
    const days = resolveAvailabilityDays({ daysPerWeek: 3 });

    expect(days).toHaveLength(3);
    expect(days.every((day) => day.maxDurationMin === NORMAL_SESSION_MAX_MIN)).toBe(true);
    // Nessun giorno consecutivo nella distribuzione di default.
    expect(days.map((day) => day.day)).toEqual(["tue", "thu", "sun"]);
  });

  it("usa il fine settimana per la seduta lunga", () => {
    const days = resolveAvailabilityDays({
      daysPerWeek: 3,
      longSession: { when: "weekend", day: null },
    });

    expect(days.find((day) => day.day === "sun")?.maxDurationMin).toBe(LONG_SESSION_MAX_MIN);
    expect(days.filter((day) => day.maxDurationMin === LONG_SESSION_MAX_MIN)).toHaveLength(1);
  });

  it("aggiunge il giorno scelto se non era nella distribuzione", () => {
    const days = resolveAvailabilityDays({
      daysPerWeek: 2,
      longSession: { when: "weekday", day: "fri" },
    });

    expect(days.map((day) => day.day)).toEqual(["tue", "fri"]);
    expect(days.find((day) => day.day === "fri")?.maxDurationMin).toBe(LONG_SESSION_MAX_MIN);
  });
});

describe("normalizeAvailability", () => {
  it("ricalcola i giorni dai controlli giorni/settimana + seduta lunga", () => {
    const parsed = AvailabilitySchema.parse({
      daysPerWeek: 4,
      longSession: { when: "weekend", day: null },
      days: [],
    });

    const normalized = normalizeAvailability(parsed);

    expect(normalized.daysPerWeek).toBe(4);
    expect(normalized.days).toHaveLength(4);
    expect(normalized.days.find((day) => day.day === "sun")?.maxDurationMin).toBe(
      LONG_SESSION_MAX_MIN,
    );
  });

  it("mantiene i giorni dei documenti precedenti, senza controlli nuovi", () => {
    const parsed = AvailabilitySchema.parse({
      days: [{ day: "mon", maxDurationMin: 45 }],
    });

    const normalized = normalizeAvailability(parsed);

    expect(normalized.daysPerWeek).toBe(1);
    expect(normalized.days[0]).toMatchObject({ day: "mon", maxDurationMin: 45 });
  });
});
