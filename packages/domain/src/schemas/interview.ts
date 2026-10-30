import { z } from "zod";

export const InterviewQuestionSchema = z.object({
  id: z.string().min(1).max(60),
  text: z.string().min(1).max(500),
  kind: z.enum(["text", "single_choice", "boolean"]),
  options: z.array(z.string().min(1).max(120)).max(8).optional(),
});

/** Valore JSON accettato nei findings: il modello può annidare oggetti/array. */
export type InterviewFindingValue =
  | string
  | number
  | boolean
  | null
  | InterviewFindingValue[]
  | { [key: string]: InterviewFindingValue };

export const InterviewFindingValueSchema: z.ZodType<InterviewFindingValue> = z.lazy(() =>
  z.union([
    z.string().max(500),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(InterviewFindingValueSchema).max(10),
    z.record(z.string().min(1).max(60), InterviewFindingValueSchema),
  ]),
);

export const InterviewFindingsSchema = z.record(
  z.string().min(1).max(60),
  InterviewFindingValueSchema,
);

/**
 * Turno dell'intervista: il modello non prescrive il piano, raccoglie i dati
 * che mancano e decide quando è pronto. Le domande sono al massimo due per
 * evitare un interrogatorio.
 */
export const InterviewTurnSchema = z.object({
  reply: z.string().min(1).max(1500),
  findings: InterviewFindingsSchema.default({}),
  questions: z.array(InterviewQuestionSchema).max(2).default([]),
  readyToPlan: z.boolean().default(false),
});

export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>;
export type InterviewFindings = z.infer<typeof InterviewFindingsSchema>;
export type InterviewTurn = z.infer<typeof InterviewTurnSchema>;
