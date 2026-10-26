import { z } from "zod";
import { IsoDateSchema, IsoDateTimeSchema } from "./common";

export const NutritionDailySchema = z.object({
  userId: z.string().min(1),
  date: IsoDateSchema,
  source: z.string().min(1),

  kcal: z.number().nonnegative().optional(),
  proteinG: z.number().nonnegative().optional(),
  carbsG: z.number().nonnegative().optional(),
  fatG: z.number().nonnegative().optional(),
  fiberG: z.number().nonnegative().optional(),

  waterMl: z.number().nonnegative().optional(),
  steps: z.number().nonnegative().optional(),
  weightKg: z.number().positive().optional(),

  goalKcal: z.number().nonnegative().optional(),
  goalProteinG: z.number().nonnegative().optional(),
  goalCarbsG: z.number().nonnegative().optional(),
  goalFatG: z.number().nonnegative().optional(),
  goalWaterMl: z.number().nonnegative().optional(),
  goalSteps: z.number().nonnegative().optional(),

  fetchedAt: IsoDateTimeSchema,
});

export type NutritionDaily = z.infer<typeof NutritionDailySchema>;
