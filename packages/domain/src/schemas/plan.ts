import { z } from "zod";
import { IsoDateSchema } from "./common";
import { MethodologyPeriodizationSchema, MethodologyWeeklyStructureSchema } from "./methodology";
import { PlannedSessionSchema } from "./session";

export const PlanPhaseSchema = z.object({
  name: z.string().min(1),
  startWeek: z.number().int().min(1),
  endWeek: z.number().int().min(1),
  focus: z.string().min(1),
  weeklyVolumeMin: z.number().int().positive().optional(),
  deload: z.boolean().default(false),
  /** Guidance della fase quando arriva dalla metodologia scelta dall'LLM. */
  sessions: z.number().int().min(1).max(14).optional(),
  qualitySessions: z.number().int().min(0).max(7).optional(),
  longSessionMin: z.number().int().min(0).max(300).optional(),
});

/**
 * Recovery window forced by a recent race or very long effort. It lives on the
 * macro plan so every weekly micro plan applies it without re-reading Garmin.
 */
export const RecoveryWindowSchema = z.object({
  weeks: z.number().int().min(1).max(8),
  reason: z.string().min(1),
  untilDate: IsoDateSchema.nullable().default(null),
});

/**
 * Metodologia con cui è stato costruito il piano. Resta sul macro-piano per
 * tracciabilità: settimane e sedute devono poter dire da quale scelta derivano.
 */
export const PlanMethodologySchema = z.object({
  name: z.string().min(1),
  rationale: z.string().min(1),
  structure: MethodologyWeeklyStructureSchema,
  periodization: MethodologyPeriodizationSchema.optional(),
  /** Fasi decise dall'LLM: se presenti, il generatore le usa così come sono. */
  phases: z.array(PlanPhaseSchema).optional(),
  /**
   * Fino a quale settimana vale questa struttura. Serve per le metodologie di
   * recupero post-gara: oltre la finestra il piano riprende la progressione
   * delle fasi, invece di restare in recupero per tutto il macrociclo.
   */
  applyThroughWeek: z.number().int().min(1).optional(),
});

export const MacroPlanSchema = z.object({
  id: z.string().min(1),
  goalDescription: z.string().min(3),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  /** Data target concordata; può cadere dentro l'ultima settimana del piano. */
  targetDate: IsoDateSchema.nullable().optional(),
  totalWeeks: z.number().int().min(4).max(52),
  phases: z.array(PlanPhaseSchema).min(1),
  rationale: z.string().min(1),
  assumptions: z.array(z.string()).default([]),
  flags: z.array(z.string()).default([]),
  recoveryWindow: RecoveryWindowSchema.nullable().optional(),
  methodology: PlanMethodologySchema.optional(),
});

export const MicroPlanSchema = z.object({
  id: z.string().min(1),
  macroPlanId: z.string().min(1),
  weekIndex: z.number().int().min(1),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  focus: z.string().min(1),
  targetLoad: z.number().min(0).optional(),
  weeklyVolumeMin: z.number().int().min(0).default(0),
  deload: z.boolean().default(false),
  sessions: z.array(PlannedSessionSchema).default([]),
  rationale: z.string().min(1),
  flags: z.array(z.string()).default([]),
});

export type PlanPhase = z.infer<typeof PlanPhaseSchema>;
export type MacroPlan = z.infer<typeof MacroPlanSchema>;
export type MicroPlan = z.infer<typeof MicroPlanSchema>;
export type PlanMethodology = z.infer<typeof PlanMethodologySchema>;
