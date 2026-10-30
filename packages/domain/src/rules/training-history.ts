import type { Sport } from "../schemas/common";
import { dayIndex } from "./capacity";
import { DEFAULT_TIME_ZONE, todayLocalDate } from "./dates";

/**
 * Campi minimi di un'attività che servono alla proiezione. È un'interfaccia
 * strutturale: `Activity` e `ContextActivity` la soddisfano senza conversioni.
 */
export interface TrainingHistoryActivity {
  sport: Sport;
  localDate: string;
  durationSec: number;
  distanceM?: number;
  avgPaceSecKm?: number;
  avgHr?: number;
  trainingEffect?: number;
  activityLoad?: number;
  title?: string;
  activityType?: string;
}

/**
 * Finestra di contesto per l'intervista di pianificazione. Non è la finestra
 * dell'aderenza: qui vogliamo vedere *che tipo* di allenamenti sono stati fatti
 * nelle ultime due settimane, non giudicare se sono stati completati.
 */
export const TRAINING_HISTORY_WINDOW_DAYS = 14;

export type TrainingSessionKind =
  | "easy"
  | "long"
  | "quality"
  | "race"
  | "strength"
  | "mobility"
  | "other";

export interface TrainingHistoryEntry {
  localDate: string;
  sport: Sport;
  /** Tipo grezzo del provider, se disponibile (es. `trail_running`). */
  activityType: string | null;
  kind: TrainingSessionKind;
  durationMin: number;
  distanceKm: number | null;
  avgPaceSecKm: number | null;
  avgHr: number | null;
  trainingEffect: number | null;
  load: number | null;
  title: string | null;
}

export interface TrainingHistoryTotals {
  sessions: number;
  durationMin: number;
  distanceKm: number;
  load: number;
}

export interface TrainingHistoryKinds {
  easy: number;
  long: number;
  quality: number;
  race: number;
  strength: number;
  mobility: number;
  other: number;
}

export interface TrainingHistory {
  windowDays: number;
  from: string;
  to: string;
  entries: TrainingHistoryEntry[];
  summary: TrainingHistoryTotals & {
    bySport: Record<Sport, number>;
    kinds: TrainingHistoryKinds;
    /** Sedute intense (qualità + gara) sul totale. */
    hardSharePct: number;
    longestSessionMin: number;
    longestDistanceKm: number;
  };
  previous: TrainingHistoryTotals & {
    hardSessions: number;
  };
  trend: {
    sessionsDelta: number;
    durationDeltaPct: number | null;
    distanceDeltaPct: number | null;
  };
}

const RACE_PATTERN = /gara|race|maraton|marathon|mezza|half|10k|5k|competi|triathlon/i;
const QUALITY_PATTERN =
  /intervall|ripetut|soglia|threshold|tempo|fartlek|vo2|sprint|progressiv|ripetute/i;

const round1 = (value: number): number => Math.round(value * 10) / 10;

const dateFromDayIndex = (day: number): string =>
  new Date(day * 86_400_000).toISOString().slice(0, 10);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? null);
}

function isLong(activity: TrainingHistoryActivity): boolean {
  const distanceM = activity.distanceM ?? 0;
  switch (activity.sport) {
    case "running":
      return distanceM >= 15_000 || activity.durationSec >= 75 * 60;
    case "cycling":
      return distanceM >= 60_000 || activity.durationSec >= 120 * 60;
    case "swimming":
      return distanceM >= 2_500 || activity.durationSec >= 60 * 60;
    default:
      return activity.durationSec >= 90 * 60;
  }
}

function classify(
  activity: TrainingHistoryActivity,
  medianPaceSecKm: number | null,
): TrainingSessionKind {
  if (activity.sport === "strength") return "strength";
  if (activity.sport === "mobility") return "mobility";
  if (activity.title && RACE_PATTERN.test(activity.title)) return "race";
  if (activity.title && QUALITY_PATTERN.test(activity.title)) return "quality";
  if (isLong(activity)) return "long";
  if ((activity.trainingEffect ?? 0) >= 4.5) return "quality";
  if (
    activity.sport === "running" &&
    activity.avgPaceSecKm !== undefined &&
    medianPaceSecKm !== null &&
    activity.avgPaceSecKm < medianPaceSecKm * 0.92
  ) {
    return "quality";
  }
  return activity.sport === "other" ? "other" : "easy";
}

function toEntry(
  activity: TrainingHistoryActivity,
  medianPaceSecKm: number | null,
): TrainingHistoryEntry {
  return {
    localDate: activity.localDate,
    sport: activity.sport,
    activityType: activity.activityType ?? null,
    kind: classify(activity, medianPaceSecKm),
    durationMin: Math.round(activity.durationSec / 60),
    distanceKm:
      activity.distanceM === undefined ? null : round1(Math.max(0, activity.distanceM) / 1000),
    avgPaceSecKm: activity.avgPaceSecKm ?? null,
    avgHr: activity.avgHr ?? null,
    trainingEffect: activity.trainingEffect ?? null,
    load: activity.activityLoad ?? null,
    title: activity.title ?? null,
  };
}

function totals(activities: readonly TrainingHistoryActivity[]): TrainingHistoryTotals {
  return {
    sessions: activities.length,
    durationMin: Math.round(
      activities.reduce((sum, activity) => sum + activity.durationSec, 0) / 60,
    ),
    distanceKm: round1(
      activities.reduce((sum, activity) => sum + Math.max(0, activity.distanceM ?? 0), 0) / 1000,
    ),
    load: Math.round(activities.reduce((sum, activity) => sum + (activity.activityLoad ?? 0), 0)),
  };
}

const deltaPct = (current: number, previous: number): number | null =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

const emptyBySport = (): Record<Sport, number> => ({
  running: 0,
  cycling: 0,
  swimming: 0,
  strength: 0,
  mobility: 0,
  other: 0,
});

/**
 * Proiezione compatta delle ultime due settimane, pensata per essere passata
 * al modello che sceglie la metodologia. Contiene fatti, non giudizi: il tipo
 * di seduta è una classificazione euristica basata su sport, titolo, durata,
 * training effect e passo relativo.
 */
export function buildTrainingHistory(
  activities: readonly TrainingHistoryActivity[],
  options: { now: string; timezone?: string; windowDays?: number },
): TrainingHistory {
  const timezone = options.timezone ?? DEFAULT_TIME_ZONE;
  const windowDays = options.windowDays ?? TRAINING_HISTORY_WINDOW_DAYS;
  const nowDay = dayIndex(todayLocalDate(timezone, new Date(options.now)));
  const fromDay = nowDay - windowDays + 1;
  const previousFromDay = fromDay - windowDays;
  const previousToDay = fromDay - 1;

  const inCurrent = activities.filter((activity) => {
    const day = dayIndex(activity.localDate);
    return day >= fromDay && day <= nowDay;
  });
  const inPrevious = activities.filter((activity) => {
    const day = dayIndex(activity.localDate);
    return day >= previousFromDay && day <= previousToDay;
  });

  const runningPaces = inCurrent
    .filter((activity) => activity.sport === "running" && (activity.avgPaceSecKm ?? 0) > 0)
    .map((activity) => activity.avgPaceSecKm as number);
  const medianPaceSecKm = median(runningPaces);

  const entries = [...inCurrent]
    .sort((a, b) => (a.localDate < b.localDate ? 1 : -1))
    .map((activity) => toEntry(activity, medianPaceSecKm));

  const bySport = emptyBySport();
  const kinds: TrainingHistoryKinds = {
    easy: 0,
    long: 0,
    quality: 0,
    race: 0,
    strength: 0,
    mobility: 0,
    other: 0,
  };
  for (const entry of entries) {
    bySport[entry.sport] += 1;
    kinds[entry.kind] += 1;
  }

  const currentTotals = totals(inCurrent);
  const previousTotals = totals(inPrevious);
  const hardSessions = kinds.quality + kinds.race;

  const previousHard = inPrevious.filter((activity) => {
    const kind = classify(activity, medianPaceSecKm);
    return kind === "quality" || kind === "race";
  }).length;

  const longest = entries.reduce(
    (best, entry) => ({
      durationMin: Math.max(best.durationMin, entry.durationMin),
      distanceKm: Math.max(best.distanceKm, entry.distanceKm ?? 0),
    }),
    { durationMin: 0, distanceKm: 0 },
  );

  return {
    windowDays,
    from: dateFromDayIndex(fromDay),
    to: dateFromDayIndex(nowDay),
    entries,
    summary: {
      ...currentTotals,
      bySport,
      kinds,
      hardSharePct:
        currentTotals.sessions > 0 ? Math.round((hardSessions / currentTotals.sessions) * 100) : 0,
      longestSessionMin: longest.durationMin,
      longestDistanceKm: round1(longest.distanceKm),
    },
    previous: {
      ...previousTotals,
      hardSessions: previousHard,
    },
    trend: {
      sessionsDelta: currentTotals.sessions - previousTotals.sessions,
      durationDeltaPct: deltaPct(currentTotals.durationMin, previousTotals.durationMin),
      distanceDeltaPct: deltaPct(currentTotals.distanceKm, previousTotals.distanceKm),
    },
  };
}
