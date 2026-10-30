import { z } from "zod";
import { SportSchema, ToneSchema } from "./common";

export const PreferencesSchema = z.object({
  dislikedExercises: z.array(z.string()).default([]),
  dislikedSports: z.array(SportSchema).default([]),
  tone: ToneSchema.default("direct"),
  units: z.enum(["metric", "imperial"]).default("metric"),
  audioCues: z.boolean().default(true),
  reminderMinutesBefore: z.number().int().min(0).max(180).default(30),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

export const defaultPreferences: Preferences = {
  dislikedExercises: [],
  dislikedSports: [],
  tone: "direct",
  units: "metric",
  audioCues: true,
  reminderMinutesBefore: 30,
};
