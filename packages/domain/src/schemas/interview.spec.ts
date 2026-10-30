import { describe, expect, it } from "vitest";
import { InterviewTurnSchema } from "./interview";

describe("InterviewTurnSchema", () => {
  it("accetta findings con valori semplici", () => {
    const parsed = InterviewTurnSchema.parse({
      reply: "Ok",
      findings: {
        gymPurpose: "supporto alla corsa",
        plyometrics: true,
        sessions: 4,
        notes: null,
      },
      questions: [],
      readyToPlan: false,
    });

    expect(parsed.findings.gymPurpose).toBe("supporto alla corsa");
    expect(parsed.findings.plyometrics).toBe(true);
  });

  it("accetta findings annidati senza rompere l'intervista", () => {
    const parsed = InterviewTurnSchema.parse({
      reply: "Ok",
      findings: {
        gymPurpose: { value: "supporto alla corsa", confidence: 0.9 },
        availability: [{ day: "sun", minutes: 120 }],
      },
      questions: [],
      readyToPlan: false,
    });

    expect(parsed.findings.gymPurpose).toEqual({
      value: "supporto alla corsa",
      confidence: 0.9,
    });
  });
});
