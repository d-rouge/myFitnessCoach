import { z } from "zod";

export const CoachAdviceRequestSchema = z
  .object({
    sessionId: z.string().min(1).optional(),
  })
  .default({});

export type CoachAdviceRequest = z.infer<typeof CoachAdviceRequestSchema>;
