import { z } from "zod";
import { IsoDateSchema } from "./common";

export const ReviewKindSchema = z.enum(["weekly", "monthly", "block"]);

export const ReviewDecisionSchema = z.enum([
  "continue",
  "progress",
  "deload",
  "retest",
  "change_macro",
]);

export const ReviewSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  kind: ReviewKindSchema.default("weekly"),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  plannedSessionsCount: z.number().int().min(0),
  completedSessionsCount: z.number().int().min(0),
  adherencePct: z.number().min(0).max(100),
  totalLoad: z.number().min(0).default(0),
  totalDurationMin: z.number().int().min(0).default(0),
  painEventsCount: z.number().int().min(0).default(0),
  decision: ReviewDecisionSchema.default("continue"),
  decisionRationale: z.string().min(1),
  coachSummary: z.string().min(1),
  nextCycleRecommendations: z.array(z.string()).default([]),
});

export type ReviewKind = z.infer<typeof ReviewKindSchema>;
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
export type Review = z.infer<typeof ReviewSchema>;
