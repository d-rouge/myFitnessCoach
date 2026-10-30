import { z } from "zod";
import { AthleteBackgroundSchema, AthleticHistorySchema, CurrentCapacitySchema } from "./athletic";
import { ExperienceTierSchema, IsoDateSchema, SexSchema, SportSchema, ToneSchema } from "./common";

export const ProfileSchema = z.object({
  birthDate: IsoDateSchema,
  sex: SexSchema,
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(300),
  /** General past sports background; it does not determine current capacity. */
  athleteBackground: AthleteBackgroundSchema.nullable().default(null),
  /**
   * Derived from `history` + `capacity` for the primary goal sport.
   * Recomputed on every save; any client-supplied value is overwritten.
   */
  experienceTier: ExperienceTierSchema.default("novice"),
  history: AthleticHistorySchema.default({ sports: [] }),
  capacity: CurrentCapacitySchema,
  sports: z.array(SportSchema).min(1),
  timezone: z.string().min(1).default("Europe/Rome"),
  tone: ToneSchema.default("direct"),
  units: z.enum(["metric", "imperial"]).default("metric"),
});

export type Profile = z.infer<typeof ProfileSchema>;
