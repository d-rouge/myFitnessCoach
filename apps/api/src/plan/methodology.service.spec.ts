import type { Env } from "@health-trainer/config";
import {
  beginnerPersona,
  buildAthleteDossier,
  type MethodologyDecision,
} from "@health-trainer/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AthleteService } from "../athlete/athlete.service.js";
import type { MongoService } from "../database/mongo.service.js";

const generateMock = vi.hoisted(() => vi.fn());
const insertOne = vi.hoisted(() => vi.fn(async (_doc?: unknown) => ({ acknowledged: true })));
const latestDoc = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../ai/llm.provider.js", () => ({
  llmSettings: () => ({ model: "deepseek-pro", thinking: true }),
  createLlmProvider: () => ({ id: "deepseek", generate: generateMock }),
}));

const { MethodologyService } = await import("./methodology.service.js");

const env = { LLM_PROVIDER: "deepseek", LLM_API_KEY: "test" } as Env;

const decision: MethodologyDecision = {
  methodology: "Base aerobica con un richiamo di qualità",
  why: "Il carico recente non sostiene due sedute intense.",
  evidence: ["Una sola seduta di qualità nelle ultime due settimane"],
  alternatives: [{ name: "Polarizzata 80/20", whyNot: "Volume recente troppo basso." }],
  weeklyStructure: {
    sessions: 3,
    qualitySessions: 1,
    longSessionMin: 45,
    strengthSessions: 2,
    plyometrics: false,
    weeklyMinutes: 150,
  },
  periodization: {
    model: "3:1",
    loadWeeks: 3,
    deloadWeeks: 1,
    taperWeeks: 1,
    rationale: "Tre settimane di carico e una di scarico, taper breve.",
  },
  assumptions: [],
  risks: [],
  dataThatWouldChange: [],
  confidence: "medium",
};

const now = "2026-10-30T08:00:00.000Z";
const dossier = buildAthleteDossier({ baseline: beginnerPersona, now });
const athlete = {
  getContext: async () => ({ baseline: beginnerPersona, dossier }),
} as unknown as AthleteService;

function mongoWithCollection() {
  return {
    getDb: async () => ({
      collection: () => ({
        insertOne,
        find: () => ({
          sort: () => ({
            limit: () => ({
              next: async () => latestDoc.current,
            }),
          }),
        }),
      }),
    }),
  } as unknown as MongoService;
}

const service = () => new MethodologyService(env, mongoWithCollection(), athlete);

describe("MethodologyService", () => {
  beforeEach(() => {
    generateMock.mockReset();
    insertOne.mockClear();
    latestDoc.current = null;
  });

  it("valida e persiste la metodologia scelta dall'LLM", async () => {
    generateMock.mockResolvedValue({
      data: decision,
      provider: "deepseek",
      model: "deepseek-pro",
      usage: {},
      latencyMs: 10,
    });

    const evaluation = await service().evaluate("user-1");

    expect(evaluation.decision.methodology).toBe(decision.methodology);
    expect(evaluation.validation.valid).toBe(true);
    expect(evaluation.envelope.maxSessionsPerWeek).toBe(3);
    expect(insertOne).toHaveBeenCalledOnce();
    expect(generateMock).toHaveBeenCalledOnce();
  });

  it("richiede una correzione quando la proposta esce dall'envelope", async () => {
    const oversized: MethodologyDecision = {
      ...decision,
      weeklyStructure: { ...decision.weeklyStructure, sessions: 6, qualitySessions: 3 },
    };
    generateMock
      .mockResolvedValueOnce({
        data: oversized,
        provider: "deepseek",
        model: "deepseek-pro",
        usage: {},
        latencyMs: 10,
      })
      .mockResolvedValueOnce({
        data: decision,
        provider: "deepseek",
        model: "deepseek-pro",
        usage: {},
        latencyMs: 10,
      });

    const evaluation = await service().evaluate("user-1");

    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(evaluation.validation.valid).toBe(true);
    expect(evaluation.decision.weeklyStructure.sessions).toBe(3);
  });

  it("restituisce l'ultima valutazione salvata", async () => {
    latestDoc.current = {
      _id: "mongo-id",
      id: "methodology_1",
      userId: "user-1",
      createdAt: now,
      promptVersion: "methodology-v1",
      goalDescription: beginnerPersona.goals.primary.description,
      provider: "deepseek",
      model: "deepseek-pro",
      envelope: {
        maxSessionsPerWeek: 3,
        maxQualitySessions: 1,
        maxLongSessionMin: 60,
        maxStrengthSessions: 3,
        maxWeeklyMinutes: 180,
        plyometricsAllowed: false,
        reasons: [],
      },
      decision,
      validation: { valid: true, issues: [] },
    };

    const evaluation = await service().latest("user-1");

    expect(evaluation?.id).toBe("methodology_1");
    expect(evaluation).not.toHaveProperty("_id");
  });
});
