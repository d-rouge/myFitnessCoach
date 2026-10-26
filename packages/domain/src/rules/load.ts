export function srpeLoad(rpe: number, minutes: number): number {
  if (!Number.isFinite(rpe) || rpe < 1 || rpe > 10) {
    throw new Error("RPE must be between 1 and 10");
  }
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error("Minutes must be a non-negative number");
  }
  return Math.round(rpe * minutes);
}

export function weeklyLoad(loads: number[]): number {
  return loads.reduce((sum, load) => sum + load, 0);
}

export function monotony(loads: number[]): number {
  if (loads.length < 2) return 0;
  const mean = loads.reduce((sum, load) => sum + load, 0) / loads.length;
  const variance = loads.reduce((sum, load) => sum + (load - mean) ** 2, 0) / (loads.length - 1);
  const sd = Math.sqrt(variance);
  return sd === 0 ? 0 : mean / sd;
}

export function strain(loads: number[]): number {
  return Math.round(weeklyLoad(loads) * monotony(loads));
}

export type AcwrFlag = "low" | "optimal" | "high" | "unknown";

export function computeAcwr(
  acuteLoad: number,
  chronicLoad: number,
): { ratio: number; flag: AcwrFlag } {
  if (chronicLoad <= 0) return { ratio: 0, flag: "unknown" };

  const ratio = acuteLoad / chronicLoad;
  const flag: AcwrFlag = ratio > 1.3 ? "high" : ratio < 0.8 ? "low" : "optimal";
  return { ratio: Number(ratio.toFixed(2)), flag };
}

export interface DailyLoad {
  date: string;
  load: number;
}

export function loadSummary(dailyLoads: DailyLoad[]): {
  acute7: number;
  chronic28: number;
  acwr: ReturnType<typeof computeAcwr>;
  monotony: number;
  strain: number;
} {
  const sorted = [...dailyLoads].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7).map((item) => item.load);
  const last28 = sorted.slice(-28).map((item) => item.load);

  const acute7 = weeklyLoad(last7);
  const chronic28 = weeklyLoad(last28);

  return {
    acute7,
    chronic28,
    acwr: computeAcwr(acute7, chronic28 / 4),
    monotony: Number(monotony(last7).toFixed(2)),
    strain: strain(last7),
  };
}
