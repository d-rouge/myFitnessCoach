import { z } from "zod";
import { IsoDateSchema } from "./common";

export const DailyStateSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  date: IsoDateSchema,
  readiness: z.number().min(0).max(100),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  ctl: z.number().min(0).default(0), // Fitness (42d)
  atl: z.number().min(0).default(0), // Fatigue (7d)
  tsb: z.number().default(0), // Form = CTL - ATL
  acwr: z.number().min(0).default(1.0),
  sleepDebtMinutes: z.number().int().default(0),
  flags: z.array(z.string()).default([]),
  summary: z.string().max(1000).optional(),
});

export const AdjustmentDecisionSchema = z.enum(["confirm", "reduce", "swap", "rest"]);

export const DailyAdjustmentSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  date: IsoDateSchema,
  decision: AdjustmentDecisionSchema,
  originalSessionId: z.string().nullable().default(null),
  adjustedSessionId: z.string().nullable().default(null),
  rationale: z.string().min(1),
  changes: z.array(z.string()).default([]),
  contextHash: z.string().min(1),
});

export type DailyState = z.infer<typeof DailyStateSchema>;
export type AdjustmentDecision = z.infer<typeof AdjustmentDecisionSchema>;
export type DailyAdjustment = z.infer<typeof DailyAdjustmentSchema>;
