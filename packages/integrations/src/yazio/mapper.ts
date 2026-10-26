import {
  type DailyMetrics,
  DailyMetricsSchema,
  type NutritionDaily,
  NutritionDailySchema,
} from "@health-trainer/domain";

type RawRecord = Record<string, unknown>;

export interface YazioMappingOptions {
  userId: string;
  date: string;
  fetchedAt: string;
}

const asRecord = (value: unknown): RawRecord | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RawRecord)
    : undefined;

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const positive = (value: unknown): number | undefined => {
  const parsed = num(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
};

const toDate = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;
};

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

interface MacroTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

const sumMeals = (raw: RawRecord): MacroTotals | undefined => {
  const meals = asRecord(raw.meals);
  if (!meals) return undefined;

  const totals: MacroTotals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
  let found = false;

  for (const mealKey of MEALS) {
    const meal = asRecord(meals[mealKey]);
    const nutrients = asRecord(meal?.nutrients);
    if (!nutrients) continue;

    found = true;
    totals.kcal += num(nutrients["energy.energy"]) ?? 0;
    totals.proteinG += num(nutrients["nutrient.protein"]) ?? 0;
    totals.carbsG += num(nutrients["nutrient.carb"]) ?? 0;
    totals.fatG += num(nutrients["nutrient.fat"]) ?? 0;
    totals.fiberG += num(nutrients["nutrient.fiber"]) ?? 0;
  }

  return found ? totals : undefined;
};

const fromTopLevel = (raw: RawRecord): MacroTotals | undefined => {
  const kcal = num(raw["energy.energy"]);
  const proteinG = num(raw["nutrient.protein"]);
  const carbsG = num(raw["nutrient.carb"]);
  const fatG = num(raw["nutrient.fat"]);
  const fiberG = num(raw["nutrient.fiber"]);

  if (
    kcal === undefined &&
    proteinG === undefined &&
    carbsG === undefined &&
    fatG === undefined &&
    fiberG === undefined
  ) {
    return undefined;
  }

  return {
    kcal: kcal ?? 0,
    proteinG: proteinG ?? 0,
    carbsG: carbsG ?? 0,
    fatG: fatG ?? 0,
    fiberG: fiberG ?? 0,
  };
};

export function mapYazioDailyNutrients(
  raw: unknown,
  options: YazioMappingOptions,
): NutritionDaily | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;

  const date = toDate(record.date) ?? options.date;
  const parsed = NutritionDailySchema.safeParse({
    userId: options.userId,
    date,
    source: "yazio",
    kcal: num(record.energy),
    proteinG: num(record.protein),
    carbsG: num(record.carb),
    fatG: num(record.fat),
    goalKcal: num(record.energy_goal),
    fetchedAt: options.fetchedAt,
  });

  return parsed.success ? parsed.data : undefined;
}

export function mapYazioSummaryExtras(
  raw: unknown,
  options: YazioMappingOptions,
): Partial<NutritionDaily> | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;

  const goals = asRecord(record.goals);
  const user = asRecord(record.user);

  return {
    date: options.date,
    goalKcal: num(goals?.["energy.energy"]),
    goalProteinG: num(goals?.["nutrient.protein"]),
    goalCarbsG: num(goals?.["nutrient.carb"]),
    goalFatG: num(goals?.["nutrient.fat"]),
    goalWaterMl: num(goals?.water),
    goalSteps: num(goals?.["activity.step"]),
    waterMl: num(record.water_intake),
    steps: num(record.steps),
    weightKg: positive(user?.current_weight),
  };
}

export function mapYazioDailySummary(
  raw: unknown,
  options: YazioMappingOptions,
): { nutrition: NutritionDaily; metrics?: DailyMetrics } | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;

  const totals = sumMeals(record) ?? fromTopLevel(record);
  const goals = asRecord(record.goals);
  const user = asRecord(record.user);
  const waterMl = num(record.water_intake);
  const steps = num(record.steps);
  const weightKg = positive(user?.current_weight);

  const nutritionCandidate = {
    userId: options.userId,
    date: options.date,
    source: "yazio",
    kcal: totals?.kcal,
    proteinG: totals?.proteinG,
    carbsG: totals?.carbsG,
    fatG: totals?.fatG,
    fiberG: totals?.fiberG,
    waterMl,
    steps,
    weightKg,
    goalKcal: num(goals?.["energy.energy"]),
    goalProteinG: num(goals?.["nutrient.protein"]),
    goalCarbsG: num(goals?.["nutrient.carb"]),
    goalFatG: num(goals?.["nutrient.fat"]),
    goalWaterMl: num(goals?.water),
    goalSteps: num(goals?.["activity.step"]),
    fetchedAt: options.fetchedAt,
  };

  const nutritionParsed = NutritionDailySchema.safeParse(nutritionCandidate);
  if (!nutritionParsed.success) return undefined;

  const hasMetrics = steps !== undefined || waterMl !== undefined || weightKg !== undefined;
  const metricsCandidate = {
    userId: options.userId,
    date: options.date,
    source: "yazio",
    steps,
    hydrationMl: waterMl,
    weightKg,
    fetchedAt: options.fetchedAt,
  };
  const metricsParsed = hasMetrics ? DailyMetricsSchema.safeParse(metricsCandidate) : undefined;

  return {
    nutrition: nutritionParsed.data,
    metrics: metricsParsed?.success ? metricsParsed.data : undefined,
  };
}

export function mapYazioWeight(
  raw: unknown,
  options: YazioMappingOptions,
): DailyMetrics | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;

  const value = positive(record.value);
  if (value === undefined) return undefined;

  const date = toDate(record.date) ?? options.date;
  const parsed = DailyMetricsSchema.safeParse({
    userId: options.userId,
    date,
    source: "yazio",
    weightKg: value,
    fetchedAt: options.fetchedAt,
  });

  return parsed.success ? parsed.data : undefined;
}
