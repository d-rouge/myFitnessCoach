import { describe, expect, it } from "vitest";
import { beginnerPersona, intermediatePersona } from "../fixtures/personas";
import type { MethodologyDecision } from "../schemas/methodology";
import { buildMethodologyEnvelope, validateMethodology } from "./methodology";
import type { RecentContext } from "./recent-context";

const recent = (overrides: Partial<RecentContext> = {}): RecentContext => ({
  asOf: "2026-10-30T08:00:00.000Z",
  lastActivityDate: "2026-10-29",
  daysSinceLastActivity: 1,
  lastLongEffort: null,
  postRaceRecovery: { active: false, reason: null, untilDate: null, weeks: 0 },
  load7dMin: 240,
  load28dMin: 960,
  acuteChronicRatio: 1,
  flags: [],
  ...overrides,
});

const decision = (overrides: Partial<MethodologyDecision> = {}): MethodologyDecision => ({
  methodology: "Piramidale con due richiami di qualità",
  why: "Il volume recente sostiene un blocco strutturato.",
  evidence: ["Carico stabile nelle ultime due settimane"],
  alternatives: [{ name: "Polarizzata 80/20", whyNot: "Servono più sedute settimanali." }],
  weeklyStructure: {
    sessions: 4,
    qualitySessions: 2,
    longSessionMin: 80,
    strengthSessions: 2,
    plyometrics: true,
    weeklyMinutes: 280,
  },
  periodization: {
    model: "3:1",
    loadWeeks: 3,
    deloadWeeks: 1,
    taperWeeks: 2,
    rationale: "Tre settimane di carico e una di scarico, con taper finale.",
  },
  assumptions: [],
  risks: [],
  dataThatWouldChange: [],
  confidence: "medium",
  ...overrides,
});

describe("buildMethodologyEnvelope", () => {
  it("è prudente con un principiante senza carico recente", () => {
    const envelope = buildMethodologyEnvelope(
      beginnerPersona,
      recent({ load7dMin: 0, load28dMin: 0 }),
    );

    expect(envelope.maxSessionsPerWeek).toBe(3);
    expect(envelope.maxQualitySessions).toBe(1);
    expect(envelope.maxLongSessionMin).toBe(60);
    expect(envelope.maxWeeklyMinutes).toBe(180);
    expect(envelope.plyometricsAllowed).toBe(false);
    expect(envelope.horizonWeeks).toBe(12);
    expect(envelope.reasons.length).toBeGreaterThan(0);
  });

  it("consente più qualità a un atleta allenato con volume recente", () => {
    const envelope = buildMethodologyEnvelope(intermediatePersona, recent());

    expect(envelope.maxSessionsPerWeek).toBe(5);
    expect(envelope.maxQualitySessions).toBe(2);
    expect(envelope.maxLongSessionMin).toBe(90);
    expect(envelope.maxWeeklyMinutes).toBe(288);
    expect(envelope.plyometricsAllowed).toBe(true);
  });

  it("azzera la qualità durante il recupero post-gara", () => {
    const envelope = buildMethodologyEnvelope(
      intermediatePersona,
      recent({
        postRaceRecovery: {
          active: true,
          reason: "maratona",
          untilDate: "2026-11-15",
          weeks: 2,
        },
      }),
    );

    expect(envelope.maxQualitySessions).toBe(0);
    expect(envelope.maxLongSessionMin).toBe(30);
    expect(envelope.maxStrengthSessions).toBe(1);
    expect(envelope.plyometricsAllowed).toBe(false);
  });
});

describe("validateMethodology", () => {
  it("accetta una proposta dentro l'envelope", () => {
    const envelope = buildMethodologyEnvelope(intermediatePersona, recent());
    const validation = validateMethodology(decision(), envelope);

    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it("rifiuta fasi non continue o che non coprono l'orizzonte", () => {
    const envelope = buildMethodologyEnvelope(intermediatePersona, recent());
    const validation = validateMethodology(
      decision({
        phases: [
          {
            name: "Base",
            startWeek: 1,
            endWeek: 4,
            focus: "Base",
            volumeShare: 1,
            deload: false,
          },
          {
            name: "Sviluppo",
            startWeek: 6,
            endWeek: 20,
            focus: "Sviluppo",
            volumeShare: 1,
            deload: false,
          },
        ],
      }),
      envelope,
    );

    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([expect.stringMatching(/deve iniziare dalla settimana 5/)]),
    );
  });

  it("rifiuta una proposta che supera i limiti", () => {
    const envelope = buildMethodologyEnvelope(beginnerPersona, recent({ load28dMin: 0 }));
    const validation = validateMethodology(
      decision({
        weeklyStructure: {
          sessions: 5,
          qualitySessions: 3,
          longSessionMin: 120,
          strengthSessions: 4,
          plyometrics: true,
          weeklyMinutes: 500,
        },
      }),
      envelope,
    );

    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Sedute settimanali/),
        expect.stringMatching(/qualità/),
        expect.stringMatching(/Seduta lunga/),
        expect.stringMatching(/forza/),
        expect.stringMatching(/Volume settimanale/),
        expect.stringMatching(/Pliometria/),
      ]),
    );
  });
});
