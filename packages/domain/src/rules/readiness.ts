export type Confidence = "high" | "medium" | "low";

export interface Baseline {
  mean: number;
  sd: number;
}

export interface ReadinessInput {
  hrvToday?: number;
  hrvBaseline?: Baseline;
  rhrToday?: number;
  rhrBaseline?: Baseline;
  sleepMinutes?: number;
  sleepNeedMinutes?: number;
  subjective?: {
    energy?: number;
    mood?: number;
    stress?: number;
    soreness?: number;
  };
}

export interface ReadinessResult {
  score: number;
  confidence: Confidence;
  flags: string[];
  components: {
    hrv?: number;
    rhr?: number;
    sleep?: number;
    subjective: number;
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const zScore = (today: number, baseline: Baseline) =>
  baseline.sd > 0 ? (today - baseline.mean) / baseline.sd : 0;

/**
 * Readiness 0-100. Objective signals are optional: with no wearable the score
 * falls back to the subjective check-in and reports low confidence.
 */
export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const flags: string[] = [];
  const subjective = input.subjective ?? {};

  const energy = subjective.energy ?? 3;
  const mood = subjective.mood ?? 3;
  const stress = subjective.stress ?? 3;
  const soreness = subjective.soreness ?? 2;

  const subjectiveScore =
    ((clamp(energy, 1, 5) +
      clamp(mood, 1, 5) +
      (6 - clamp(stress, 1, 5)) +
      (6 - clamp(soreness, 0, 5))) /
      20) *
    100;

  let hrvScore: number | undefined;
  if (input.hrvToday !== undefined && input.hrvBaseline) {
    const z = zScore(input.hrvToday, input.hrvBaseline);
    hrvScore = clamp(50 + 25 * z, 0, 100);
    if (z < -1) flags.push("low_hrv");
    if (z > 1.5) flags.push("elevated_hrv");
  }

  let rhrScore: number | undefined;
  if (input.rhrToday !== undefined && input.rhrBaseline) {
    const z = zScore(input.rhrToday, input.rhrBaseline);
    rhrScore = clamp(50 - 25 * z, 0, 100);
    if (z > 1) flags.push("elevated_rhr");
  }

  let sleepScore: number | undefined;
  if (input.sleepMinutes !== undefined && input.sleepNeedMinutes !== undefined) {
    sleepScore = clamp((input.sleepMinutes / input.sleepNeedMinutes) * 100, 0, 100);
    if (input.sleepMinutes < input.sleepNeedMinutes * 0.8) flags.push("sleep_debt");
  }

  if (soreness >= 4) flags.push("high_soreness");
  if (stress >= 4) flags.push("high_stress");

  const weighted: Array<{ value: number; weight: number }> = [
    { value: subjectiveScore, weight: 0.25 },
  ];
  if (hrvScore !== undefined) weighted.push({ value: hrvScore, weight: 0.35 });
  if (rhrScore !== undefined) weighted.push({ value: rhrScore, weight: 0.15 });
  if (sleepScore !== undefined) weighted.push({ value: sleepScore, weight: 0.25 });

  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const score = weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;

  const objectiveSignals = [hrvScore, rhrScore, sleepScore].filter(
    (value) => value !== undefined,
  ).length;

  const confidence: Confidence =
    objectiveSignals === 3 ? "high" : objectiveSignals >= 1 ? "medium" : "low";

  return {
    score: Math.round(clamp(score, 0, 100)),
    confidence,
    flags: [...new Set(flags)],
    components: {
      hrv: hrvScore !== undefined ? Math.round(hrvScore) : undefined,
      rhr: rhrScore !== undefined ? Math.round(rhrScore) : undefined,
      sleep: sleepScore !== undefined ? Math.round(sleepScore) : undefined,
      subjective: Math.round(subjectiveScore),
    },
  };
}

export function readinessDecision(score: number): "proceed" | "reduce" | "recover" | "rest" {
  if (score >= 80) return "proceed";
  if (score >= 60) return "reduce";
  if (score >= 40) return "recover";
  return "rest";
}
