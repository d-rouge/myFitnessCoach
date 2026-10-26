import { z } from "zod";
import { ExperienceSchema, IsoDateSchema, SexSchema, SportSchema, ToneSchema } from "./common";

export const ProfileSchema = z.object({
  birthDate: IsoDateSchema,
  sex: SexSchema,
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(300),
  experience: ExperienceSchema,
  sports: z.array(SportSchema).min(1),
  timezone: z.string().min(1).default("Europe/Rome"),
  tone: ToneSchema.default("direct"),
  units: z.enum(["metric", "imperial"]).default("metric"),
});

export type Profile = z.infer<typeof ProfileSchema>;
