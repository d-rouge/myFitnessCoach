import { z } from "zod";
import { IsoDateSchema, IsoDateTimeSchema, SportSchema } from "./common";

export const ActivitySchema = z.object({
  userId: z.string().min(1),
  source: z.string().min(1),
  externalId: z.string().min(1),
  sport: SportSchema,
  /** Tipo grezzo del provider (es. `trail_running`, `strength_training`). */
  activityType: z.string().min(1).optional(),
  start: IsoDateTimeSchema,
  localDate: IsoDateSchema,
  durationSec: z.number().nonnegative(),
  distanceM: z.number().nonnegative().optional(),
  avgHr: z.number().positive().optional(),
  maxHr: z.number().positive().optional(),
  avgPower: z.number().optional(),
  normalizedPower: z.number().optional(),
  avgSpeedMps: z.number().nonnegative().optional(),
  avgPaceSecKm: z.number().positive().optional(),
  elevationGainM: z.number().optional(),
  calories: z.number().nonnegative().optional(),
  trainingEffect: z.number().optional(),
  activityLoad: z.number().optional(),
  title: z.string().optional(),
  rawFileKey: z.string().optional(),
  linkedSessionId: z.string().optional(),
  fetchedAt: IsoDateTimeSchema,
});

export type Activity = z.infer<typeof ActivitySchema>;
