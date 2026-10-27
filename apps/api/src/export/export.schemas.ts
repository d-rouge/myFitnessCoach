import { z } from "zod";

export const HevyExportSchema = z
  .object({
    sessionId: z.string().min(1).optional(),
    apiKey: z.string().min(1).max(500).optional(),
  })
  .default({});

export type HevyExportInput = z.infer<typeof HevyExportSchema>;
