import { z } from "zod";
import { IsoDateSchema, SportSchema } from "./common";

export const IntensityModeSchema = z.enum(["rpe", "heart_rate", "pace", "power", "zone"]);

export const SessionStepSchema = z.object({
  kind: z.enum(["warmup", "work", "recovery", "cooldown", "rest", "mobility"]),
  durationMin: z.number().positive().optional(),
  distanceM: z.number().positive().optional(),
  target: z.string().min(1).optional(),
  notes: z.string().max(500).optional(),
});

export const SessionBlockSchema = z.object({
  repeat: z.number().int().min(1).default(1),
  steps: z.array(SessionStepSchema).min(1),
});

export const SessionAlternativeSchema = z.object({
  label: z.string().min(1),
  changes: z.string().min(1),
});

export const PlannedSessionSchema = z.object({
  id: z.string().min(1),
  date: IsoDateSchema,
  sport: SportSchema,
  type: z.string().min(1),
  title: z.string().min(1),
  durationMin: z.number().int().positive(),
  intensity: z.object({
    mode: IntensityModeSchema,
    target: z.string().optional(),
    rpe: z.number().int().min(1).max(10).optional(),
  }),
  blocks: z.array(SessionBlockSchema).default([]),
  equipment: z.array(z.string()).default([]),
  location: z.enum(["home", "gym", "outdoor", "pool", "other"]).default("other"),
  successCriteria: z.string().optional(),
  alternatives: z.array(SessionAlternativeSchema).default([]),
  contraindications: z.array(z.string()).default([]),
  notes: z.string().max(2000).optional(),
  status: z.enum(["planned", "completed", "skipped", "adjusted"]).default("planned"),
});

export type SessionStep = z.infer<typeof SessionStepSchema>;
export type SessionBlock = z.infer<typeof SessionBlockSchema>;
export type SessionAlternative = z.infer<typeof SessionAlternativeSchema>;
export type PlannedSession = z.infer<typeof PlannedSessionSchema>;
