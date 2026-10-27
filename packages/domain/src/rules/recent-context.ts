import type { Sport } from "../schemas/common";
import { dayIndex } from "./capacity";

/**
 * Facts about the athlete's recent past, derived from imported activities.
 *
 * This is deliberately *not* prose and *not* a judgment: it is a compact,
 * stable payload that both layers can consume:
 * - the deterministic rules use it as hard guards (a marathon three days ago
 *   forbids a loading week, no matter how motivated the athlete is);
 * - the LLM receives it as base data and may explain it, prioritise it or
 *   phrase it, but cannot override the guard.
 */
export interface ContextActivity {
  sport: Sport;
  localDate: string;
  durationSec: number;
  distanceM?: number;
  title?: string;
  trainingEffect?: number;
}

export interface LongEffort {
  localDate: string;
  daysAgo: number;
  sport: Sport;
  distanceM: number;
  durationSec: number;
  kind: "race" | "long_effort";
  label: string;
  recoveryDays: number;
}

export interface RecentContext {
  asOf: string;
  lastActivityDate: string | null;
  daysSinceLastActivity: number | null;
  lastLongEffort: LongEffort | null;
  postRaceRecovery: {
    active: boolean;
    reason: string | null;
    untilDate: string | null;
    /** Whole weeks still to protect, so the plan can act on it. */
    weeks: number;
  };
  load7dMin: number;
  load28dMin: number;
  /** Acute (7d) vs weekly average of the last 28d. */
  acuteChronicRatio: number | null;
  flags: string[];
}

const RACE_PATTERN = /maraton|marathon|mezza|half|gara|race|competi|ultra|triathlon|10k|5k/i;

interface RecoveryRule {
  applies: (activity: ContextActivity) => boolean;
  days: number;
  label: string;
}

const RECOVERY_RULES: RecoveryRule[] = [
  {
    applies: (a) => a.sport === "running" && (a.distanceM ?? 0) >= 40_000,
    days: 21,
    label: "maratona",
  },
  {
    applies: (a) => a.sport === "running" && (a.distanceM ?? 0) >= 20_000,
    days: 14,
    label: "mezza maratona o distanza simile",
  },
  {
    applies: (a) => a.sport === "running" && (a.distanceM ?? 0) >= 15_000,
    days: 7,
    label: "lungo intenso",
  },
  {
    applies: (a) => a.sport === "cycling" && (a.distanceM ?? 0) >= 100_000,
    days: 10,
    label: "gran fondo",
  },
  {
    applies: (a) => a.durationSec >= 150 * 60,
    days: 7,
    label: "sforzo molto lungo",
  },
];

function recoveryFor(activity: ContextActivity): { days: number; label: string } | null {
  const rule = RECOVERY_RULES.find((candidate) => candidate.applies(activity));
  if (!rule) return null;

  const labelledAsRace = activity.title ? RACE_PATTERN.test(activity.title) : false;
  return {
    days: labelledAsRace ? Math.max(rule.days, 14) : rule.days,
    label: labelledAsRace ? `gara (${rule.label})` : rule.label,
  };
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Builds the recent-context payload. Pure and deterministic: the same
 * activities and `now` always produce the same facts.
 */
export function buildRecentContext(
  activities: readonly ContextActivity[],
  options: { now: string },
): RecentContext {
  const nowDay = dayIndex(options.now);
  const sorted = [...activities].sort((a, b) => (a.localDate < b.localDate ? 1 : -1));
  const last = sorted[0] ?? null;

  const load7dMin = sorted
    .filter((a) => nowDay - dayIndex(a.localDate) < 7)
    .reduce((sum, a) => sum + a.durationSec / 60, 0);
  const load28dMin = sorted
    .filter((a) => nowDay - dayIndex(a.localDate) < 28)
    .reduce((sum, a) => sum + a.durationSec / 60, 0);

  const weeklyAverage28 = load28dMin / 4;
  const acuteChronicRatio =
    weeklyAverage28 > 0 ? Number((load7dMin / weeklyAverage28).toFixed(2)) : null;

  const candidates = sorted
    .filter((a) => nowDay - dayIndex(a.localDate) < 28)
    .map((activity) => {
      const recovery = recoveryFor(activity);
      if (!recovery) return null;
      const daysAgo = nowDay - dayIndex(activity.localDate);
      return {
        localDate: activity.localDate,
        daysAgo,
        sport: activity.sport,
        distanceM: Math.round(activity.distanceM ?? 0),
        durationSec: Math.round(activity.durationSec),
        kind: (activity.title && RACE_PATTERN.test(activity.title) ? "race" : "long_effort") as
          | "race"
          | "long_effort",
        label: recovery.label,
        recoveryDays: recovery.days,
      } satisfies LongEffort;
    })
    .filter((value): value is LongEffort => value !== null);

  // The most recent effort that still imposes a recovery window wins; if none
  // is still active, report the latest one for context.
  const active = candidates.filter((effort) => effort.daysAgo < effort.recoveryDays);
  const lastLongEffort = (active[0] ?? candidates[0] ?? null) as LongEffort | null;

  const flags: string[] = [];
  if (lastLongEffort && lastLongEffort.daysAgo < lastLongEffort.recoveryDays) {
    flags.push("post_race_recovery");
  }
  if (lastLongEffort) flags.push("long_effort_recent");
  if (acuteChronicRatio !== null && acuteChronicRatio > 1.5) flags.push("load_spike");

  const daysSinceLastActivity = last ? nowDay - dayIndex(last.localDate) : null;
  if (daysSinceLastActivity !== null && daysSinceLastActivity >= 14) {
    flags.push("detraining_gap");
  }

  const recoveryActive = flags.includes("post_race_recovery") && lastLongEffort !== null;
  const remainingDays = recoveryActive
    ? (lastLongEffort?.recoveryDays ?? 0) - (lastLongEffort?.daysAgo ?? 0)
    : 0;

  return {
    asOf: options.now,
    lastActivityDate: last?.localDate ?? null,
    daysSinceLastActivity,
    lastLongEffort,
    postRaceRecovery: {
      active: recoveryActive,
      reason: recoveryActive
        ? `${lastLongEffort?.label ?? "sforzo lungo"} il ${lastLongEffort?.localDate} (${lastLongEffort?.daysAgo} giorni fa): finestra di recupero di ${lastLongEffort?.recoveryDays} giorni.`
        : null,
      untilDate:
        recoveryActive && lastLongEffort
          ? addDays(lastLongEffort.localDate, lastLongEffort.recoveryDays)
          : null,
      weeks: recoveryActive ? Math.max(1, Math.ceil(remainingDays / 7)) : 0,
    },
    load7dMin: Math.round(load7dMin),
    load28dMin: Math.round(load28dMin),
    acuteChronicRatio,
    flags,
  };
}
