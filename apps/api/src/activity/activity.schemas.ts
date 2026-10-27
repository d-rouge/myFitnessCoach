import { z } from "zod";

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data ISO non valida (formato YYYY-MM-DD)");

const SportSchema = z.enum(["running", "cycling", "swimming", "strength", "mobility", "other"]);

export const ManualActivitySchema = z.object({
  sessionId: z.string().min(1).optional(),
  sport: SportSchema.optional(),
  durationMin: z.coerce.number().positive().max(600),
  distanceKm: z.coerce.number().min(0).max(1000).optional(),
  avgHr: z.coerce.number().int().min(30).max(250).optional(),
  maxHr: z.coerce.number().int().min(30).max(250).optional(),
  rpe: z.coerce.number().int().min(1).max(10).optional(),
  notes: z.string().max(2000).optional(),
  date: IsoDateSchema.optional(),
});

export const UploadFitSchema = z.object({
  base64: z.string().min(1, "Il campo 'base64' è obbligatorio"),
  filename: z.string().min(1).max(255).optional(),
});

export const ActivityHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type ManualActivityInput = z.infer<typeof ManualActivitySchema>;
export type UploadFitInput = z.infer<typeof UploadFitSchema>;
export type ActivityHistoryQuery = z.infer<typeof ActivityHistoryQuerySchema>;
