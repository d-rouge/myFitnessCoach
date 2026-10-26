import { z } from "zod";

export const EquipmentItemSchema = z.enum([
  "bodyweight",
  "dumbbells",
  "barbell",
  "kettlebell",
  "resistance_band",
  "foam_roller",
  "treadmill",
  "indoor_bike",
  "pool",
  "ems",
  "other",
]);

export const EquipmentSchema = z.object({
  items: z.array(EquipmentItemSchema).default([]),
  gymAccess: z.boolean().default(false),
  poolAccess: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
});

export type EquipmentItem = z.infer<typeof EquipmentItemSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
