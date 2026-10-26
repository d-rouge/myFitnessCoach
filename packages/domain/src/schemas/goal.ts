import { z } from "zod";
import { IsoDateSchema, SportSchema } from "./common";

export const GoalTypeSchema = z.enum([
  "race",
  "performance",
  "body_composition",
  "health",
  "strength",
  "habit",
]);

export const GoalSchema = z.object({
  type: GoalTypeSchema,
  sport: SportSchema.optional(),
  description: z.string().min(3).max(500),
  targetDate: IsoDateSchema.optional(),
  metric: z.string().min(1).optional(),
  targetValue: z.number().finite().optional(),
  targetUnit: z.string().min(1).optional(),
  priority: z.enum(["primary", "secondary"]).default("primary"),
});

export const GoalSetSchema = z.object({
  primary: GoalSchema,
  secondary: z.array(GoalSchema).max(3).default([]),
});

export type Goal = z.infer<typeof GoalSchema>;
export type GoalSet = z.infer<typeof GoalSetSchema>;
