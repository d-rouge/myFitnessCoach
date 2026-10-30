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

/**
 * Esito del controllo metodologico agganciato alla review settimanale. Non è
 * la review del piano: dice se la metodologia è stata rivalutata con i dati
 * nuovi e quale metodologia risulta valida ora.
 */
export const MethodologyReviewSchema = z.object({
  refreshed: z.boolean(),
  decisionId: z.string().min(1),
  methodology: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  checkedAt: z.string().min(1),
});

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
  /** Controllo metodologico eseguito insieme alla review. */
  methodologyReview: MethodologyReviewSchema.nullable().optional(),
});

export type ReviewKind = z.infer<typeof ReviewKindSchema>;
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
export type MethodologyReview = z.infer<typeof MethodologyReviewSchema>;
export type Review = z.infer<typeof ReviewSchema>;
