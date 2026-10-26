import { z } from "zod";
import { IsoDateSchema } from "./common";

export const PlanPhaseSchema = z.object({
  name: z.string().min(1),
  startWeek: z.number().int().min(1),
  endWeek: z.number().int().min(1),
  focus: z.string().min(1),
  weeklyVolumeMin: z.number().int().positive().optional(),
  deload: z.boolean().default(false),
});

export const MacroPlanSchema = z.object({
  id: z.string().min(1),
  goalDescription: z.string().min(3),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  totalWeeks: z.number().int().min(4).max(52),
  phases: z.array(PlanPhaseSchema).min(1),
  rationale: z.string().min(1),
  assumptions: z.array(z.string()).default([]),
  flags: z.array(z.string()).default([]),
});

export type PlanPhase = z.infer<typeof PlanPhaseSchema>;
export type MacroPlan = z.infer<typeof MacroPlanSchema>;
