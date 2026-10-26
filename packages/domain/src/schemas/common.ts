import { z } from "zod";

export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date in YYYY-MM-DD format");

export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const WeekdaySchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

export const SportSchema = z.enum([
  "running",
  "cycling",
  "swimming",
  "strength",
  "mobility",
  "other",
]);

export const ExperienceSchema = z.enum(["beginner", "intermediate", "advanced"]);

export const SexSchema = z.enum(["male", "female", "other", "prefer_not_to_say"]);

export const ToneSchema = z.enum(["direct", "supportive", "analytical"]);

export type Sport = z.infer<typeof SportSchema>;
export type Weekday = z.infer<typeof WeekdaySchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Sex = z.infer<typeof SexSchema>;
export type Tone = z.infer<typeof ToneSchema>;
