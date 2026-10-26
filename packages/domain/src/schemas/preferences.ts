import { z } from "zod";
import { SportSchema, ToneSchema } from "./common";

export const PreferredTrainingTimeSchema = z.enum([
  "morning",
  "lunch",
  "afternoon",
  "evening",
  "any",
]);

export const PreferencesSchema = z.object({
  dislikedExercises: z.array(z.string()).default([]),
  dislikedSports: z.array(SportSchema).default([]),
  preferredTrainingTime: PreferredTrainingTimeSchema.default("morning"),
  tone: ToneSchema.default("direct"),
  units: z.enum(["metric", "imperial"]).default("metric"),
  audioCues: z.boolean().default(true),
  reminderMinutesBefore: z.number().int().min(0).max(180).default(30),
});

export type PreferredTrainingTime = z.infer<typeof PreferredTrainingTimeSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;

export const defaultPreferences: Preferences = {
  dislikedExercises: [],
  dislikedSports: [],
  preferredTrainingTime: "morning",
  tone: "direct",
  units: "metric",
  audioCues: true,
  reminderMinutesBefore: 30,
};
