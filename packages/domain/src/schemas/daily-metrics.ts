import { z } from "zod";
import { IsoDateSchema, IsoDateTimeSchema } from "./common";

export const DailyMetricsSchema = z.object({
  userId: z.string().min(1),
  date: IsoDateSchema,
  source: z.string().min(1),

  restingHr: z.number().positive().optional(),
  hrvAvgMs: z.number().optional(),
  hrvWeeklyAvgMs: z.number().optional(),
  hrvStatus: z.string().optional(),

  sleepMinutes: z.number().nonnegative().optional(),
  deepSleepMin: z.number().nonnegative().optional(),
  lightSleepMin: z.number().nonnegative().optional(),
  remSleepMin: z.number().nonnegative().optional(),
  awakeMin: z.number().nonnegative().optional(),
  sleepScore: z.number().min(0).max(100).optional(),
  sleepNeedMin: z.number().nonnegative().optional(),
  sleepStressAvg: z.number().optional(),

  steps: z.number().nonnegative().optional(),
  stepGoal: z.number().nonnegative().optional(),
  distanceM: z.number().nonnegative().optional(),

  caloriesResting: z.number().nonnegative().optional(),
  caloriesActive: z.number().nonnegative().optional(),
  caloriesTotal: z.number().nonnegative().optional(),

  intensityModerateMin: z.number().nonnegative().optional(),
  intensityVigorousMin: z.number().nonnegative().optional(),

  stressAvg: z.number().optional(),
  stressMax: z.number().optional(),

  bodyBatteryMin: z.number().optional(),
  bodyBatteryMax: z.number().optional(),
  bodyBatteryEnd: z.number().optional(),
  bodyBatteryCharged: z.number().optional(),
  bodyBatteryDrained: z.number().optional(),

  spo2Avg: z.number().optional(),
  spo2Min: z.number().optional(),
  respirationAvg: z.number().optional(),

  weightKg: z.number().positive().optional(),
  bodyFatPct: z.number().min(0).max(70).optional(),
  hydrationMl: z.number().nonnegative().optional(),

  fetchedAt: IsoDateTimeSchema,
});

export type DailyMetrics = z.infer<typeof DailyMetricsSchema>;
