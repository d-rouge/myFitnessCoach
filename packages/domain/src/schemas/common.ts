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

/**
 * Structured competitive/training level reached in a single sport.
 * `none` means no structured practice; `elite` means national/international
 * competition. This describes the past, not the present.
 */
export const TrainingLevelSchema = z.enum(["none", "amateur", "competitive", "elite"]);

/**
 * Derived athletic tier. Never asked to the athlete and never trusted from the
 * client: it is recomputed server-side from `profile.history` and
 * `profile.capacity` for the primary goal sport.
 *
 * - `novice`: little structured history and not currently active.
 * - `returning`: meaningful history (>= 2 years or competitive) but detrained
 *   for >= 12 months. Fast re-adaptation, fragile tendons.
 * - `trained`: history or current consistency is enough to progress normally.
 * - `highly_trained`: competitive background plus sustained current training.
 */
export const ExperienceTierSchema = z.enum(["novice", "returning", "trained", "highly_trained"]);

export const SexSchema = z.enum(["male", "female", "other", "prefer_not_to_say"]);

export const ToneSchema = z.enum(["direct", "supportive", "analytical"]);

export type Sport = z.infer<typeof SportSchema>;
export type Weekday = z.infer<typeof WeekdaySchema>;
export type TrainingLevel = z.infer<typeof TrainingLevelSchema>;
export type ExperienceTier = z.infer<typeof ExperienceTierSchema>;
export type Sex = z.infer<typeof SexSchema>;
export type Tone = z.infer<typeof ToneSchema>;
