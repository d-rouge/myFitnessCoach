import { z } from "zod";

export const MethodologyConfidenceSchema = z.enum(["low", "medium", "high"]);

export const MethodologyWeeklyStructureSchema = z.object({
  sessions: z.number().int().min(1).max(14),
  qualitySessions: z.number().int().min(0).max(7),
  longSessionMin: z.number().int().min(0).max(300),
  strengthSessions: z.number().int().min(0).max(7),
  plyometrics: z.boolean(),
  weeklyMinutes: z.number().int().min(0).max(2000).optional(),
});

/**
 * Fase del macrociclo definita dall'LLM. Il volume è relativo
 * (`volumeShare`) per non far inventare minuti assoluti: il generatore lo
 * traduce sul volume base della metodologia.
 */
export const MethodologyPhaseSchema = z.object({
  name: z.string().min(1).max(120),
  startWeek: z.number().int().min(1).max(52),
  endWeek: z.number().int().min(1).max(52),
  focus: z.string().min(1).max(500),
  /** 1 = volume base della metodologia. */
  volumeShare: z.number().min(0.3).max(1.5).default(1),
  deload: z.boolean().default(false),
  /** Override per la fase: sedute, qualità e lungo. */
  sessions: z.number().int().min(1).max(14).optional(),
  qualitySessions: z.number().int().min(0).max(7).optional(),
  longSessionMin: z.number().int().min(0).max(300).optional(),
});

/**
 * Periodizzazione scelta dall'LLM: quante settimane di carico prima dello
 * scarico, quanti scarichi per ciclo e quante settimane di taper. Non è una
 * costante: dipende dall'orizzonte, dall'atleta e dalla fase.
 */
export const MethodologyPeriodizationSchema = z.object({
  model: z.string().min(1).max(120),
  loadWeeks: z.number().int().min(1).max(12),
  deloadWeeks: z.number().int().min(0).max(4),
  taperWeeks: z.number().int().min(0).max(12),
  rationale: z.string().min(1).max(2000),
});

export const MethodologyAlternativeSchema = z.object({
  name: z.string().min(1).max(120),
  whyNot: z.string().min(1).max(2000),
});

/**
 * Decisione metodologica del modello. Non contiene sedute: contiene la
 * metodologia, la struttura settimanale e le motivazioni. La generazione delle
 * sedute resta un passaggio successivo e separato.
 */
export const MethodologyDecisionSchema = z.object({
  methodology: z.string().min(1).max(120),
  why: z.string().min(1).max(4000),
  evidence: z.array(z.string().min(1).max(500)).min(1).max(10),
  alternatives: z.array(MethodologyAlternativeSchema).min(1).max(5),
  weeklyStructure: MethodologyWeeklyStructureSchema,
  /** Obbligatoria nella pratica, ma opzionale nello schema per poterla
   * correggere con un retry invece di fallire al parsing. */
  periodization: MethodologyPeriodizationSchema.optional(),
  /**
   * Fasi del macrociclo decise dal modello. Se presenti sostituiscono le fasi
   * deterministiche: l'LLM controlla l'intero arco, non solo il primo blocco.
   */
  phases: z.array(MethodologyPhaseSchema).min(2).max(6).optional(),
  assumptions: z.array(z.string().max(500)).max(10).default([]),
  risks: z.array(z.string().max(500)).max(10).default([]),
  dataThatWouldChange: z.array(z.string().max(500)).max(10).default([]),
  confidence: MethodologyConfidenceSchema,
});

/**
 * Limiti entro cui la metodologia scelta deve stare. Non è una prescrizione:
 * è il recinto di sicurezza calcolato dai dati dell'atleta.
 */
export const MethodologyEnvelopeSchema = z.object({
  maxSessionsPerWeek: z.number().int().min(1).max(14),
  maxQualitySessions: z.number().int().min(0).max(7),
  maxLongSessionMin: z.number().int().min(0).max(300),
  maxStrengthSessions: z.number().int().min(0).max(7),
  maxWeeklyMinutes: z.number().int().min(0).max(2000),
  plyometricsAllowed: z.boolean(),
  /** Settimane disponibili fino alla data target; 0 = nessuna data. */
  horizonWeeks: z.number().int().min(0).max(52),
  reasons: z.array(z.string()).default([]),
});

export type MethodologyConfidence = z.infer<typeof MethodologyConfidenceSchema>;
export type MethodologyWeeklyStructure = z.infer<typeof MethodologyWeeklyStructureSchema>;
export type MethodologyPeriodization = z.infer<typeof MethodologyPeriodizationSchema>;
export type MethodologyPhase = z.infer<typeof MethodologyPhaseSchema>;
export type MethodologyDecision = z.infer<typeof MethodologyDecisionSchema>;
export type MethodologyEnvelope = z.infer<typeof MethodologyEnvelopeSchema>;
