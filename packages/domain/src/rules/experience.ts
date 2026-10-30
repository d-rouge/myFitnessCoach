import type { AthleticHistory, CurrentCapacity, SportHistory } from "../schemas/athletic";
import type { ExperienceTier, Sport, TrainingLevel } from "../schemas/common";

/**
 * Months of detraining after which retained fitness stops translating into
 * acute load tolerance. Past this point the athlete is `returning`: they
 * re-adapt quickly, but they start from current capacity.
 */
export const DETRAINING_RETURNING_MONTHS = 12;

/** Years of regular practice that count as meaningful history. */
export const MEANINGFUL_HISTORY_YEARS = 2;

/** Weeks of uninterrupted training needed before "advanced" prescriptions. */
export const SUSTAINED_TRAINING_WEEKS = 12;
export const HIGHLY_TRAINED_WEEKS = 24;

/** Longest recent session required for the top tier, in minutes. */
export const HIGHLY_TRAINED_LONGEST_SESSION_MIN = 60;

export interface ExperienceInput {
  history: AthleticHistory;
  capacity: CurrentCapacity;
  /** The sport of the primary goal, never "the athlete in general". */
  sport: Sport;
}

const COMPETITIVE_LEVELS: readonly TrainingLevel[] = ["competitive", "elite"];

export function isCompetitiveLevel(level: TrainingLevel): boolean {
  return COMPETITIVE_LEVELS.includes(level);
}

/**
 * Athletic tier for a single sport.
 *
 * History and current capacity answer different questions and are deliberately
 * kept apart:
 * - current capacity is the hard gate on the starting load;
 * - history is the multiplier on progression speed and session complexity.
 *
 * A former competitive athlete who stopped two years ago is `returning`, not
 * `highly_trained`: cardiovascular fitness returns in weeks, tendons and bone
 * take months.
 */
export function deriveExperienceTier({
  history,
  capacity,
  sport,
}: ExperienceInput): ExperienceTier {
  const entry = history.sports.find((item) => item.sport === sport);
  const yearsRegular = entry?.yearsRegular ?? 0;
  const level = entry?.level ?? "none";
  const detrainingMonths = entry?.detrainingMonths ?? 0;

  const competitive = isCompetitiveLevel(level);
  const meaningfulHistory = competitive || yearsRegular >= MEANINGFUL_HISTORY_YEARS;

  if (
    competitive &&
    detrainingMonths < DETRAINING_RETURNING_MONTHS &&
    capacity.activeWeeks >= HIGHLY_TRAINED_WEEKS &&
    capacity.weeklySessions >= 3 &&
    capacity.longestRecentSessionMin >= HIGHLY_TRAINED_LONGEST_SESSION_MIN
  ) {
    return "highly_trained";
  }

  if (meaningfulHistory && detrainingMonths >= DETRAINING_RETURNING_MONTHS) {
    return "returning";
  }

  if (meaningfulHistory || capacity.activeWeeks >= SUSTAINED_TRAINING_WEEKS) {
    return "trained";
  }

  return "novice";
}

const TIER_LABELS: Record<ExperienceTier, string> = {
  novice: "Principiante",
  returning: "Rientro dopo stop",
  trained: "Allenato",
  highly_trained: "Agonista / alto livello",
};

export function experienceTierLabel(tier: ExperienceTier): string {
  return TIER_LABELS[tier];
}

/**
 * Short Italian explanation shown under the onboarding field, so the athlete
 * sees *why* the system classified them and can correct the inputs.
 */
export function deriveExperienceTierRationale(input: ExperienceInput): string {
  const tier = deriveExperienceTier(input);
  const entry = input.history.sports.find((item) => item.sport === input.sport);
  const years = entry?.yearsRegular ?? 0;
  const gap = entry?.detrainingMonths ?? 0;

  switch (tier) {
    case "highly_trained":
      return `Background ${entry?.level ?? "agonistico"} e ${input.capacity.activeWeeks} settimane di allenamento continuo: progressione in percentuale ridotta, tetto alto.`;
    case "returning":
      return `${years > 0 ? `${years} anni di pratica` : "Background agonistico"} ma fermo da ${gap} mesi: riadattamento rapido, carico iniziale prudente per i primi 3 settimane.`;
    case "trained":
      return years >= MEANINGFUL_HISTORY_YEARS
        ? `${years} anni di pratica regolare e nessuno stop lungo: progressione standard.`
        : `${input.capacity.activeWeeks} settimane di continuità attuale: progressione standard.`;
    default:
      return "Storia sportiva limitata e continuità attuale ridotta: si parte da volumi bassi e sessioni semplici.";
  }
}

/** The tier is always derived for the primary goal sport. */
export function primarySportOf(input: {
  goals: { primary: { sport?: Sport } };
  profile: { sports: Sport[] };
}): Sport {
  return input.goals.primary.sport ?? input.profile.sports[0] ?? "running";
}
type LegacyExperience = "beginner" | "intermediate" | "advanced";

const LEGACY_PROFILES: Record<LegacyExperience, { level: TrainingLevel; history: SportHistory }> = {
  beginner: {
    level: "none",
    history: { sport: "running", level: "none", yearsRegular: 0, detrainingMonths: 0 },
  },
  intermediate: {
    level: "amateur",
    history: { sport: "running", level: "amateur", yearsRegular: 2, detrainingMonths: 0 },
  },
  advanced: {
    level: "amateur",
    history: { sport: "running", level: "amateur", yearsRegular: 5, detrainingMonths: 0 },
  },
};

const LEGACY_CAPACITY: Record<LegacyExperience, CurrentCapacity> = {
  beginner: {
    lastActivityDate: null,
    activeWeeks: 0,
    weeklySessions: 0,
    longestRecentSessionMin: 0,
    recent5kSec: null,
    source: "calibration",
    asOf: null,
  },
  intermediate: {
    lastActivityDate: null,
    activeWeeks: 12,
    weeklySessions: 3,
    longestRecentSessionMin: 45,
    recent5kSec: null,
    source: "calibration",
    asOf: null,
  },
  advanced: {
    lastActivityDate: null,
    activeWeeks: 24,
    weeklySessions: 4,
    longestRecentSessionMin: 70,
    recent5kSec: null,
    source: "calibration",
    asOf: null,
  },
};

export interface LegacyProfile {
  sports?: Sport[];
  history?: AthleticHistory;
  capacity?: CurrentCapacity;
  experienceTier?: ExperienceTier;
  /** Removed single-enum field still present in documents saved before the split. */
  experience?: LegacyExperience;
}

export interface NormalizedExperience {
  experienceTier: ExperienceTier;
  history: AthleticHistory;
  capacity: CurrentCapacity;
}

/**
 * Fills `history`/`capacity` for documents saved with the old single
 * `experience` enum, so old baselines keep rendering instead of breaking the
 * onboarding form. Re-derived on the next save.
 */
export function normalizeProfileExperience<T extends LegacyProfile>(
  profile: T,
): T & NormalizedExperience {
  if (profile.history && profile.capacity && profile.experienceTier) {
    return profile as T & NormalizedExperience;
  }

  const legacy = profile.experience ?? "beginner";
  const mapped = LEGACY_PROFILES[legacy] ?? LEGACY_PROFILES.beginner;
  const sport = profile.sports?.[0] ?? "running";
  const capacity = profile.capacity ?? LEGACY_CAPACITY[legacy] ?? LEGACY_CAPACITY.beginner;
  const history = profile.history ?? { sports: [{ ...mapped.history, sport }] };

  return {
    ...profile,
    experienceTier:
      profile.experienceTier ??
      deriveExperienceTier({
        history,
        capacity,
        sport,
      }),
    history,
    capacity,
  };
}

interface BaselineLike {
  profile: LegacyProfile & { sports: Sport[] };
  goals: { primary: { sport?: Sport } };
}

/**
 * Single entry point for reading a baseline: migrates legacy documents and
 * recomputes the tier. Every consumer (API reads, plan generation) goes
 * through this so a stale or absent `experienceTier` can never leak into a
 * prescription.
 */
export function withDerivedExperienceTier<T extends BaselineLike>(baseline: T): T {
  const profile = normalizeProfileExperience(baseline.profile);
  const sport = primarySportOf(baseline);

  return {
    ...baseline,
    profile: {
      ...profile,
      experienceTier: deriveExperienceTier({
        history: profile.history,
        capacity: profile.capacity,
        sport,
      }),
    },
  };
}
