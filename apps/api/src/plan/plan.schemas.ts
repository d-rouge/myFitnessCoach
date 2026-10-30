import { z } from "zod";

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data ISO non valida (formato YYYY-MM-DD)");

export const GenerateMacroSchema = z.object({
  startDate: IsoDateSchema.optional(),
  targetDate: IsoDateSchema.optional(),
  totalWeeks: z.coerce.number().int().min(1).max(52).optional(),
});

export const GenerateMicroSchema = z.object({
  weekIndex: z.coerce.number().int().min(1).max(52),
});

export const MicroQuerySchema = z.object({
  weekIndex: z.coerce.number().int().min(1).max(52).optional(),
});

export const UpdateSessionSchema = z
  .object({
    status: z.enum(["planned", "completed", "skipped", "adjusted"]).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Almeno un campo è richiesto",
  });

export const InterviewMessageSchema = z.object({
  message: z.string().min(1).max(2000),
});

export type InterviewMessageInput = z.infer<typeof InterviewMessageSchema>;

export type GenerateMacroInput = z.infer<typeof GenerateMacroSchema>;
export type GenerateMicroInput = z.infer<typeof GenerateMicroSchema>;
export type MicroQueryInput = z.infer<typeof MicroQuerySchema>;
export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>;
