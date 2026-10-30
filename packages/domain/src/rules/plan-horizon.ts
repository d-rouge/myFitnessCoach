export const MIN_PLAN_WEEKS = 4;
export const MAX_PLAN_WEEKS = 52;

const DAY_MS = 86_400_000;

/** Settimane intere tra due date ISO, includendo il giorno target. */
export function weeksBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${endDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.ceil((end - start + DAY_MS) / (7 * DAY_MS));
}

/**
 * Orizzonte del piano: la data target concordata comanda. Se manca o è nel
 * passato, si usa il fallback della tipologia di obiettivo. Il risultato è
 * sempre dentro i limiti del macro-piano.
 */
export function planHorizonWeeks(
  startDate: string,
  targetDate: string | null | undefined,
  fallbackWeeks: number,
): number {
  const fromTarget = targetDate ? weeksBetween(startDate, targetDate) : 0;
  const weeks = fromTarget > 0 ? fromTarget : fallbackWeeks;
  return Math.min(MAX_PLAN_WEEKS, Math.max(MIN_PLAN_WEEKS, weeks));
}
