import { z } from "zod";
import { IsoDateSchema, IsoDateTimeSchema, SportSchema } from "./common";

export const ActivitySplitSchema = z.object({
  index: z.number().int().nonnegative(),
  durationSec: z.number().nonnegative(),
  distanceM: z.number().nonnegative().optional(),
  avgHr: z.number().positive().optional(),
  maxHr: z.number().positive().optional(),
  avgPower: z.number().optional(),
  avgPaceSecKm: z.number().positive().optional(),
  avgSpeedMps: z.number().nonnegative().optional(),
  ascentM: z.number().optional(),
  calories: z.number().nonnegative().optional(),
  intensity: z.string().optional(),
  trigger: z.string().optional(),
});

export const ActivityZoneSchema = z.object({
  zone: z.number().int().positive(),
  minutes: z.number().nonnegative(),
});

export const ActivityAnalysisSchema = z.object({
  userId: z.string().min(1),
  externalId: z.string().min(1),
  source: z.string().min(1),
  sport: SportSchema,
  date: IsoDateSchema,

  summary: z.object({
    durationSec: z.number().nonnegative(),
    movingSec: z.number().nonnegative().optional(),
    distanceM: z.number().nonnegative().optional(),
    avgHr: z.number().positive().optional(),
    maxHr: z.number().positive().optional(),
    avgPower: z.number().optional(),
    normalizedPower: z.number().optional(),
    avgPaceSecKm: z.number().positive().optional(),
    avgSpeedMps: z.number().nonnegative().optional(),
    avgCadence: z.number().nonnegative().optional(),
    maxCadence: z.number().nonnegative().optional(),
    ascentM: z.number().optional(),
    descentM: z.number().optional(),
    calories: z.number().nonnegative().optional(),
    trainingEffect: z.number().optional(),
    anaerobicTrainingEffect: z.number().optional(),
    trainingLoad: z.number().optional(),
    startTime: IsoDateTimeSchema.optional(),
  }),

  laps: z.array(ActivitySplitSchema).default([]),
  splits: z.array(ActivitySplitSchema).default([]),
  hrZones: z.array(ActivityZoneSchema).default([]),

  derived: z.object({
    paceVariabilityPct: z.number().nonnegative().optional(),
    hrDriftPct: z.number().optional(),
    negativeSplit: z.boolean().optional(),
    bestSplitPaceSecKm: z.number().positive().optional(),
    worstSplitPaceSecKm: z.number().positive().optional(),
    elevationPerKm: z.number().optional(),
  }),

  brief: z.string().min(1),
  parsedAt: IsoDateTimeSchema,
});

export type ActivitySplit = z.infer<typeof ActivitySplitSchema>;
export type ActivityZone = z.infer<typeof ActivityZoneSchema>;
export type ActivityAnalysis = z.infer<typeof ActivityAnalysisSchema>;
