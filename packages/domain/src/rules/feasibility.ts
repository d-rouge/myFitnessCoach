import type { Experience } from "../schemas/common";

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

const BASE_WEEKLY_IMPROVEMENT: Record<Experience, number> = {
  beginner: 0.0075,
  intermediate: 0.0045,
  advanced: 0.0025,
};

export interface FiveKProjectionInput {
  current5kSec: number;
  weeks: number;
  experience: Experience;
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

  const adherence = clamp(input.adherence ?? 0.8, 0, 1);
  const adherenceFactor = 0.5 + adherence * 0.5;
  const volumeFactor = clamp(input.weeklyVolumeKm / 40, 0.6, 1.2);
  const base = BASE_WEEKLY_IMPROVEMENT[input.experience];

  const weeklyRate = clamp(base * adherenceFactor * volumeFactor, 0, 0.015);
  const apply = (rate: number) => input.current5kSec * (1 - rate) ** input.weeks;

  const projectedSec = apply(weeklyRate);
  const bestSec = apply(weeklyRate * 1.3);
  const worstSec = apply(weeklyRate * 0.6);

  const confidence =
    input.weeks >= 8 && input.weeklyVolumeKm >= 25 && adherence >= 0.8
      ? "high"
      : input.weeks >= 6
        ? "medium"
        : "low";

  return {
    projectedSec: Math.round(projectedSec),
    bestSec: Math.round(bestSec),
    worstSec: Math.round(worstSec),
    weeklyImprovementPct: Number((weeklyRate * 100).toFixed(2)),
    confidence,
    rationale: `Stima basata su esperienza ${input.experience}, ${input.weeklyVolumeKm} km/settimana, aderenza ${Math.round(adherence * 100)}% e ${input.weeks} settimane.`,
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
