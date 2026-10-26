import { z } from "zod";
import { AnamnesisSchema } from "./anamnesis";
import { AvailabilitySchema } from "./availability";
import { EquipmentSchema } from "./equipment";
import { GoalSetSchema } from "./goal";
import { defaultPreferences, PreferencesSchema } from "./preferences";
import { ProfileSchema } from "./profile";

export const BaselineSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  version: z.number().int().min(1).default(1),
  validFrom: z.string(),
  supersededAt: z.string().nullable().default(null),
  profile: ProfileSchema,
  anamnesis: AnamnesisSchema,
  goals: GoalSetSchema,
  availability: AvailabilitySchema,
  equipment: EquipmentSchema,
  preferences: PreferencesSchema.default(defaultPreferences),
  summary: z.string().max(3000).optional(),
});

export type Baseline = z.infer<typeof BaselineSchema>;
