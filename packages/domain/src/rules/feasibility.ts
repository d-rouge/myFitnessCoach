import type { ExperienceTier } from "../schemas/common";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Riegel's endurance formula. Distances in metres, time in seconds.
 */
export function riegelTime(
  currentTimeSec: number,
  currentDistanceM: number,
  targetDistanceM: number,
  exponent = 1.06,
): number {
  if (currentTimeSec <= 0 || currentDistanceM <= 0 || targetDistanceM <= 0) {
    throw new Error("Time and distances must be positive");
  }
  return currentTimeSec * (targetDistanceM / currentDistanceM) ** exponent;
}

/**
 * Expected weekly improvement in relative terms. Novices have the most
 * headroom; returning athletes re-adapt fast but from a better base; highly
 * trained athletes gain little in percentage because they are close to their
 * ceiling.
 */
const BASE_WEEKLY_IMPROVEMENT: Record<ExperienceTier, number> = {
  novice: 0.009,
  returning: 0.008,
  trained: 0.0045,
  highly_trained: 0.0025,
};

export interface FiveKProjectionInput {
  current5kSec: number;
  weeks: number;
  tier: ExperienceTier;
  weeklyVolumeKm: number;
  adherence?: number;
}

export interface FiveKProjection {
  projectedSec: number;
  bestSec: number;
  worstSec: number;
  weeklyImprovementPct: number;
  confidence: "high" | "medium" | "low";
  rationale: string;
}

export function project5k(input: FiveKProjectionInput): FiveKProjection {
  if (input.current5kSec <= 0 || input.weeks <= 0) {
    throw new Error("Current time and weeks must be positive");
  }
  if (input.weeklyVolumeKm < 0) {
    throw new Error("Weekly volume cannot be negative");
  }

  // `undefined` = aderenza non considerata (es. proiezione prima che esista
  // uno storico): nessun fattore correttivo e nessuna affermazione sul
  // comportamento futuro. Non la sostituiamo con un 80% inventato.
  const measuredAdherence = input.adherence === undefined ? null : clamp(input.adherence, 0, 1);
  const adherenceFactor = measuredAdherence === null ? 1 : 0.5 + measuredAdherence * 0.5;
  const volumeFactor = clamp(input.weeklyVolumeKm / 40, 0.6, 1.2);
  const base = BASE_WEEKLY_IMPROVEMENT[input.tier];

  const weeklyRate = clamp(base * adherenceFactor * volumeFactor, 0, 0.015);
  const apply = (rate: number) => input.current5kSec * (1 - rate) ** input.weeks;

  const projectedSec = apply(weeklyRate);
  const bestSec = apply(weeklyRate * 1.3);
  const worstSec = apply(weeklyRate * 0.6);

  // Senza aderenza la confidenza non può essere alta, ma non è nemmeno
  // automaticamente bassa: dipende dalla qualità degli altri input misurati.
  const confidence =
    measuredAdherence === null
      ? input.weeks >= 6 && input.weeks <= 26 && input.weeklyVolumeKm >= 15
        ? "medium"
        : "low"
      : measuredAdherence >= 0.8 &&
          input.weeks >= 8 &&
          input.weeks <= 26 &&
          input.weeklyVolumeKm >= 25
        ? "high"
        : measuredAdherence >= 0.6 && input.weeks >= 6 && input.weeklyVolumeKm >= 15
          ? "medium"
          : "low";

  const volumeKm = Number(input.weeklyVolumeKm.toFixed(1));
  const adherenceText =
    measuredAdherence === null ? "" : `, aderenza ${Math.round(measuredAdherence * 100)}%`;

  return {
    projectedSec: Math.round(projectedSec),
    bestSec: Math.round(bestSec),
    worstSec: Math.round(worstSec),
    weeklyImprovementPct: Number((weeklyRate * 100).toFixed(2)),
    confidence,
    rationale: `Stima basata su livello ${input.tier}, ${volumeKm} km/settimana${adherenceText} e ${input.weeks} settimane.`,
  };
}

export type GoalVerdict = "realistic" | "ambitious" | "unrealistic";

export interface FiveKGoalAssessment extends FiveKProjection {
  targetSec: number;
  verdict: GoalVerdict;
  suggestedTargetSec: number;
}

export function assess5kGoal(
  input: FiveKProjectionInput & { target5kSec: number },
): FiveKGoalAssessment {
  if (input.target5kSec <= 0) throw new Error("Target time must be positive");

  const projection = project5k(input);
  const verdict: GoalVerdict =
    input.target5kSec >= projection.worstSec
      ? "realistic"
      : input.target5kSec >= projection.bestSec
        ? "ambitious"
        : "unrealistic";

  return {
    ...projection,
    targetSec: input.target5kSec,
    verdict,
    suggestedTargetSec: Math.round(projection.worstSec / 5) * 5,
  };
}
