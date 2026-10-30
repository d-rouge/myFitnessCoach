import { z } from "zod";
import { IsoDateSchema, type Weekday, WeekdaySchema } from "./common";

export const TimeWindowSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:mm"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:mm"),
});

export const DayAvailabilitySchema = z.object({
  day: WeekdaySchema,
  windows: z.array(TimeWindowSchema).default([]),
  maxDurationMin: z.number().int().min(10).max(300).default(60),
});

/**
 * Disponibilità per una seduta più lunga. Non chiediamo i minuti: la durata la
 * decide il piano in base al carico. Chiediamo solo se e quando c'è spazio per
 * un allenamento più lungo.
 */
export const LongSessionAvailabilitySchema = z.object({
  when: z.enum(["weekend", "weekday"]),
  /** Valorizzato solo con `when: "weekday"`. */
  day: WeekdaySchema.nullable().default(null),
});

export const AvailabilitySchema = z.object({
  /** Giorni a settimana scelti dall'atleta. Assente nei documenti precedenti. */
  daysPerWeek: z.number().int().min(1).max(7).optional(),
  longSession: LongSessionAvailabilitySchema.nullable().optional(),
  /**
   * Giorni concreti su cui il generatore distribuisce le sedute. Derivati da
   * `daysPerWeek` + `longSession`; restano nel documento per compatibilità e
   * per non far dipendere il piano da un ricalcolo del client.
   */
  days: z.array(DayAvailabilitySchema).default([]),
  blackouts: z.array(IsoDateSchema).default([]),
});

export type DayAvailability = z.infer<typeof DayAvailabilitySchema>;
export type LongSessionAvailability = z.infer<typeof LongSessionAvailabilitySchema>;
export type Availability = z.infer<typeof AvailabilitySchema>;

/** Durata di riferimento di una seduta normale e di quella lunga. */
export const NORMAL_SESSION_MAX_MIN = 60;
export const LONG_SESSION_MAX_MIN = 120;

const WEEK_ORDER: Record<Weekday, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

/**
 * Distribuzione di default dei giorni, scelta per non mettere sedute intense
 * in giorni consecutivi. Il numero di giorni è l'unica cosa che chiediamo.
 */
const DEFAULT_DAYS: Record<number, Weekday[]> = {
  1: ["wed"],
  2: ["tue", "sat"],
  3: ["tue", "thu", "sun"],
  4: ["tue", "thu", "sat", "sun"],
  5: ["mon", "tue", "thu", "sat", "sun"],
  6: ["mon", "tue", "wed", "thu", "sat", "sun"],
  7: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
};

function longSessionDay(longSession: LongSessionAvailability | null | undefined): Weekday | null {
  if (!longSession) return null;
  if (longSession.when === "weekend") return "sun";
  return longSession.day ?? "wed";
}

/**
 * Traduce i controlli dell'atleta (giorni/settimana + eventuale seduta lunga)
 * nei giorni concreti usati dal generatore. Se il giorno lungo non è nella
 * distribuzione di default, sostituisce l'ultimo giorno normale.
 */
export function resolveAvailabilityDays(input: {
  daysPerWeek: number;
  longSession?: LongSessionAvailability | null;
}): DayAvailability[] {
  const count = Math.min(7, Math.max(1, Math.round(input.daysPerWeek)));
  const days = [...(DEFAULT_DAYS[count] ?? ["tue", "thu", "sun"])];
  const longDay = longSessionDay(input.longSession);

  if (longDay) {
    const index = days.indexOf(longDay);
    if (index === -1) {
      if (days.length >= count && days.length > 0) {
        days[days.length - 1] = longDay;
      } else {
        days.push(longDay);
      }
    }
  }

  return days
    .sort((a, b) => WEEK_ORDER[a] - WEEK_ORDER[b])
    .map((day) => ({
      day,
      windows: [],
      maxDurationMin: day === longDay ? LONG_SESSION_MAX_MIN : NORMAL_SESSION_MAX_MIN,
    }));
}

/**
 * Normalizza la disponibilità di una baseline: se l'atleta ha usato i nuovi
 * controlli, i giorni concreti vengono ricalcolati qui, lato server. I
 * documenti precedenti (solo `days`) restano validi e ricevono `daysPerWeek`.
 */
export function normalizeAvailability(availability: Availability): Availability {
  const daysPerWeek = availability.daysPerWeek ?? availability.days.length;
  if (availability.daysPerWeek === undefined) {
    return { ...availability, daysPerWeek };
  }

  return {
    ...availability,
    daysPerWeek,
    days: resolveAvailabilityDays({
      daysPerWeek,
      longSession: availability.longSession ?? null,
    }),
  };
}
