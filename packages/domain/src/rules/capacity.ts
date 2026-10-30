import type { Activity } from "../schemas/activity";
import type { CurrentCapacity } from "../schemas/athletic";
import type { Sport } from "../schemas/common";
import { todayLocalDate } from "./dates";
import { riegelTime } from "./feasibility";

/** Window used for sessions/week and the longest recent session. */
export const CAPACITY_SESSIONS_WINDOW_DAYS = 28;

/** Window displayed in the athlete profile as a summary of recent activity. */
export const CAPACITY_ACTIVITY_SUMMARY_DAYS = 90;

/** Window used to look for a reference run to project a 5k time. */
export const CAPACITY_5K_WINDOW_DAYS = 56;

/** Shortest run accepted as a 5k reference: below this, projection is noise. */
export const CAPACITY_5K_MIN_DISTANCE_M = 3000;

const DAY_MS = 86_400_000;

export interface CapacityActivity {
  sport: Sport;
  start: string;
  localDate: string;
  durationSec: number;
  distanceM?: number;
}

/** Attività usata come riferimento per proiettare un tempo sui 5 km. */
export interface FiveKReference {
  localDate: string;
  distanceM: number;
  durationSec: number;
  /** Tempo equivalente sui 5 km secondo Riegel. */
  projected5kSec: number;
}

/**
 * Migliore riferimento recente sui 5 km: l'attività con la proiezione più
 * veloce nella finestra, non la più recente. Espone anche la corsa di partenza
 * perché la UI deve poter dire *su quale dato* è costruita la stima.
 */
export function findFiveKReference(
  activities: readonly CapacityActivity[],
  options: { now: string; sport?: Sport; timezone?: string },
): FiveKReference | null {
  const nowDay = dayIndex(
    options.timezone
      ? todayLocalDate(options.timezone, new Date(options.now))
      : options.now.slice(0, 10),
  );
  const sport = options.sport ?? "running";
  let best: FiveKReference | null = null;

  for (const activity of activities) {
    if (activity.sport !== sport) continue;
    if (nowDay - dayIndex(activity.localDate) >= CAPACITY_5K_WINDOW_DAYS) continue;

    const distanceM = activity.distanceM ?? 0;
    if (distanceM < CAPACITY_5K_MIN_DISTANCE_M || activity.durationSec <= 0) continue;

    const projected5kSec = Math.round(riegelTime(activity.durationSec, distanceM, 5000));
    if (best === null || projected5kSec < best.projected5kSec) {
      best = {
        localDate: activity.localDate,
        distanceM,
        durationSec: activity.durationSec,
        projected5kSec,
      };
    }
  }

  return best;
}

export interface CapacityCoverage {
  activities: number;
  activitiesLast90Days: number;
  durationSecondsLast90Days: number;
  lastActivityDate: string | null;
  firstActivityDateInWindow: string | null;
}

export interface CapacityEstimate {
  /** False when there is nothing to measure: the athlete must enter it manually. */
  available: boolean;
  capacity: CurrentCapacity;
  coverage: CapacityCoverage;
  warnings: string[];
}

export function dayIndex(date: string): number {
  return Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

/** Monday-based week start index. */
function weekStart(day: number): number {
  return day - ((day + 3) % 7);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Derives the athlete's *current capacity* from imported activities.
 *
 * This is the measured half of the experience model: it answers "what can you
 * do now" without asking, which is what actually gates the starting load.
 * Training history stays a manual question because no watch can know it.
 */
export function estimateCapacityFromActivities(
  activities: readonly CapacityActivity[],
  options: { now: string; sport?: Sport; timezone?: string } = {
    now: new Date().toISOString(),
  },
): CapacityEstimate {
  // "Today" is the athlete's calendar day, not the UTC one: at 00:30 in Rome
  // the UTC date is still yesterday and every day offset would be off by one.
  const nowDay = dayIndex(
    options.timezone ? todayLocalDate(options.timezone, new Date(options.now)) : options.now,
  );
  const sorted = [...activities].sort((a, b) => (a.localDate < b.localDate ? 1 : -1));
  const last = sorted[0] ?? null;
  const lastDay = last ? dayIndex(last.localDate) : null;

  const warnings: string[] = [];
  if (sorted.length === 0) {
    return {
      available: false,
      capacity: {
        lastActivityDate: null,
        activeWeeks: 0,
        weeklySessions: 0,
        longestRecentSessionMin: 0,
        recent5kSec: null,
        recent5kSource: "measured",
        source: "garmin",
        asOf: options.now,
      },
      coverage: {
        activities: 0,
        activitiesLast90Days: 0,
        durationSecondsLast90Days: 0,
        lastActivityDate: null,
        firstActivityDateInWindow: null,
      },
      warnings: ["no_activities"],
    };
  }

  if (lastDay !== null && nowDay - lastDay > 28) {
    warnings.push("inactive_over_4_weeks");
  }

  // Consecutive weeks with at least one activity, walking back from the
  // current week. One empty week is tolerated so a rest week does not reset
  // six months of consistency to zero.
  const activeWeeksSet = new Set(sorted.map((activity) => weekStart(dayIndex(activity.localDate))));
  const currentWeek = weekStart(nowDay);
  let anchor = currentWeek;
  if (!activeWeeksSet.has(anchor)) {
    if (activeWeeksSet.has(anchor - 7)) {
      anchor -= 7;
    } else {
      anchor = Number.NaN;
    }
  }

  let activeWeeks = 0;
  if (!Number.isNaN(anchor)) {
    // A single empty week (rest, travel, illness) does not reset a block; two
    // consecutive empty weeks do.
    let skippedWeek = false;
    for (let week = anchor; week >= anchor - 7 * 103; week -= 7) {
      if (activeWeeksSet.has(week)) {
        activeWeeks += 1;
        continue;
      }
      if (skippedWeek) break;
      skippedWeek = true;
    }
  }
  if (activeWeeks === 0) warnings.push("no_current_consistency");

  const recent = sorted.filter(
    (activity) => nowDay - dayIndex(activity.localDate) < CAPACITY_SESSIONS_WINDOW_DAYS,
  );
  const recent90Days = sorted.filter((activity) => {
    const daysAgo = nowDay - dayIndex(activity.localDate);
    return daysAgo >= 0 && daysAgo < CAPACITY_ACTIVITY_SUMMARY_DAYS;
  });
  const weeklySessions = clampInt(recent.length / (CAPACITY_SESSIONS_WINDOW_DAYS / 7), 0, 14);
  const longestRecentSessionMin = clampInt(
    recent.reduce((max, activity) => Math.max(max, activity.durationSec / 60), 0),
    0,
    600,
  );

  const sport = options.sport ?? "running";
  const reference = findFiveKReference(sorted, {
    now: options.now,
    sport,
    timezone: options.timezone,
  });
  const recent5kSec = reference?.projected5kSec ?? null;
  if (recent5kSec === null) warnings.push("no_5k_reference");

  const firstInWindow = recent.at(-1)?.localDate ?? null;

  return {
    available: true,
    capacity: {
      lastActivityDate: last?.localDate ?? null,
      activeWeeks: clampInt(activeWeeks, 0, 520),
      weeklySessions,
      longestRecentSessionMin,
      recent5kSec: recent5kSec === null ? null : clampInt(recent5kSec, 0, 20000),
      recent5kSource: "measured",
      source: "garmin",
      asOf: options.now,
    },
    coverage: {
      activities: sorted.length,
      activitiesLast90Days: recent90Days.length,
      durationSecondsLast90Days: recent90Days.reduce(
        (total, activity) => total + activity.durationSec,
        0,
      ),
      lastActivityDate: last?.localDate ?? null,
      firstActivityDateInWindow: firstInWindow,
    },
    warnings,
  };
}

/**
 * Conserva il tempo 5K dichiarato dall'atleta quando la capacità viene
 * ricalcolata dalle attività. Un valore misurato, invece, viene aggiornato dal
 * nuovo calcolo: è un dato derivato, non una dichiarazione.
 */
export function preserveDeclaredFiveK(
  measured: CurrentCapacity,
  previous: CurrentCapacity,
): CurrentCapacity {
  if (previous.recent5kSource !== "declared" || previous.recent5kSec === null) return measured;
  return { ...measured, recent5kSec: previous.recent5kSec, recent5kSource: "declared" };
}

/** Narrowing helper so the API can feed stored documents straight in. */
export function toCapacityActivity(activity: Activity): CapacityActivity {
  return {
    sport: activity.sport,
    start: activity.start,
    localDate: activity.localDate,
    durationSec: activity.durationSec,
    distanceM: activity.distanceM,
  };
}
