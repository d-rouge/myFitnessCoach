import { z } from "zod";
import { IsoDateSchema } from "./common";

export const PainSchema = z.object({
  area: z.string().min(1),
  intensity: z.number().int().min(0).max(10),
  sharp: z.boolean().default(false),
  notes: z.string().max(500).optional(),
});

export const CheckinSchema = z.object({
  date: IsoDateSchema,
  type: z.enum(["morning", "post_session"]),
  sleepQuality: z.number().int().min(1).max(5).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  mood: z.number().int().min(1).max(5).optional(),
  stress: z.number().int().min(1).max(5).optional(),
  soreness: z.number().int().min(0).max(5).optional(),
  pain: z.array(PainSchema).default([]),
  availableTimeMin: z.number().int().min(0).max(300).optional(),
  rpe: z.number().int().min(1).max(10).optional(),
  notes: z.string().max(2000).optional(),
});

export type Pain = z.infer<typeof PainSchema>;
export type Checkin = z.infer<typeof CheckinSchema>;
