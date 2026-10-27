import { z } from "zod";
import { SportSchema, TrainingLevelSchema } from "./common";

/**
 * One sport the athlete has practiced, with the two things that actually
 * change a plan: how long they did it and how long ago they stopped.
 */
export const SportHistorySchema = z.object({
  sport: SportSchema,
  /** Best level ever reached in this sport. */
  level: TrainingLevelSchema.default("none"),
  /** Cumulative years of regular practice (not calendar age). */
  yearsRegular: z.number().min(0).max(60).default(0),
  /** Months since the last regular block in this sport. 0 = still training. */
  detrainingMonths: z.number().int().min(0).max(720).default(0),
});

/**
 * What the athlete HAS done.
 *
 * History unlocks *how fast* the plan may progress and how complex sessions
 * may become. It never authorizes the starting load: a former competitive
 * athlete who stopped two years ago still starts from current capacity.
 */
export const AthleticHistorySchema = z.object({
  sports: z.array(SportHistorySchema).max(10).default([]),
});

/**
 * What the athlete can do NOW.
 *
 * This is the hard gate on the starting load. It is measured, not declared:
 * weeks of current consistency, sessions per week, the longest recent session
 * and (when available) a recent 5k time.
 */
export const CurrentCapacitySchema = z.object({
  /** Consecutive weeks of training in the current block. 0 = restarting now. */
  activeWeeks: z.number().int().min(0).max(520).default(0),
  /** Sessions per week actually done in the last 4 weeks. */
  weeklySessions: z.number().int().min(0).max(14).default(0),
  /** Longest single session in the last 4 weeks, in minutes. */
  longestRecentSessionMin: z.number().int().min(0).max(600).default(0),
  /** Most recent 5k time in seconds, if the athlete knows it. */
  recent5kSec: z.number().int().min(0).max(20000).nullable().default(null),
  /**
   * Where the numbers come from.
   * - `garmin`: recomputed server-side from imported activities on save and on
   *   plan generation; the client only sends the intent, never the numbers.
   * - `manual`: the athlete typed them.
   * - `calibration`: nothing to measure yet. Week 1 of the plan is a test week
   *   at low intensity, and the capacity is re-estimated as soon as data
   *   exists.
   */
  source: z.enum(["manual", "garmin", "calibration"]).default("manual"),
  asOf: z.string().datetime({ offset: true }).nullable().default(null),
});

export type SportHistory = z.infer<typeof SportHistorySchema>;
export type AthleticHistory = z.infer<typeof AthleticHistorySchema>;
export type CurrentCapacity = z.infer<typeof CurrentCapacitySchema>;
