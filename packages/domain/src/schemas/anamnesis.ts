import { z } from "zod";

export const InjurySchema = z.object({
  area: z.string().min(1),
  status: z.enum(["acute", "recovering", "chronic", "resolved"]),
  painLevel: z.number().int().min(0).max(10).default(0),
  restrictions: z.array(z.string()).default([]),
  notes: z.string().max(1000).optional(),
});

export const AnamnesisSchema = z.object({
  conditions: z.array(z.string()).default([]),
  medications: z.array(z.string()).default([]),
  injuries: z.array(InjurySchema).default([]),
  redFlags: z.array(z.string()).default([]),
  parqCleared: z.boolean().default(false),
  freeText: z.string().max(5000).optional(),
});

export type Injury = z.infer<typeof InjurySchema>;
export type Anamnesis = z.infer<typeof AnamnesisSchema>;
