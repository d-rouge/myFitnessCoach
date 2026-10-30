import type { Env } from "@health-trainer/config";
import type { InterviewTurn } from "@health-trainer/domain";
import { beginnerPersona, buildAthleteDossier } from "@health-trainer/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AthleteService } from "../athlete/athlete.service.js";
import type { BaselineService } from "../baseline/baseline.service.js";
import type { MongoService } from "../database/mongo.service.js";
import type { MethodologyService } from "./methodology.service.js";
import type { PlanService } from "./plan.service.js";

const generateMock = vi.hoisted(() => vi.fn());
const docs = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock("../ai/llm.provider.js", () => ({
  llmSettings: () => ({ model: "deepseek-flash", thinking: false }),
  createLlmProvider: () => ({ id: "deepseek", generate: generateMock }),
}));

const { InterviewService } = await import("./interview.service.js");

const env = { LLM_PROVIDER: "deepseek", LLM_API_KEY: "test" } as Env;
const now = "2026-10-30T08:00:00.000Z";
const dossier = buildAthleteDossier({ baseline: beginnerPersona, now });

const athlete = {
  getContext: async () => ({ baseline: beginnerPersona, dossier }),
} as unknown as AthleteService;

const methodology = {
  evaluate: vi.fn(async () => ({ id: "methodology_1" })),
} as unknown as MethodologyService;

const plan = {
  generateMacroPlan: vi.fn(async () => ({
    macroPlan: { id: "macro_1" },
    microPlan: { id: "micro_1" },
  })),
} as unknown as PlanService;

const mongo = {
  getDb: async () => ({
    collection: () => ({
      insertOne: async (doc: Record<string, unknown>) => {
        docs.push(structuredClone(doc));
        return { acknowledged: true };
      },
      updateOne: async (
        filter: { userId: string; id: string },
        update: { $set: Record<string, unknown> },
      ) => {
        const doc = docs.find((item) => item.userId === filter.userId && item.id === filter.id);
        if (doc) Object.assign(doc, update.$set);
        return { matchedCount: doc ? 1 : 0 };
      },
      findOne: async (filter: { userId: string; id: string }) =>
        docs.find((item) => item.userId === filter.userId && item.id === filter.id) ?? null,
      find: (filter: { userId: string }) => ({
        sort: () => ({
          limit: () => ({
            next: async () =>
              [...docs].reverse().find((item) => item.userId === filter.userId) ?? null,
          }),
        }),
      }),
    }),
  }),
} as unknown as MongoService;

const turn = (overrides: Partial<InterviewTurn> = {}): InterviewTurn => ({
  reply: "Ciao, la palestra la usi per la corsa o per fitness generale?",
  findings: {},
  questions: [
    {
      id: "gym_purpose",
      text: "La palestra è per la corsa o per fitness generale?",
      kind: "single_choice",
      options: ["Supporto alla corsa", "Fitness generale"],
    },
  ],
  readyToPlan: false,
  ...overrides,
});

const saveBaselineMock = vi.fn(async (_userId: string, input: unknown) => input);
const baselines = { save: saveBaselineMock } as unknown as BaselineService;

const service = () => new InterviewService(env, mongo, athlete, baselines, methodology, plan);

describe("InterviewService", () => {
  beforeEach(() => {
    docs.length = 0;
    generateMock.mockReset();
    vi.mocked(methodology.evaluate).mockClear();
    vi.mocked(plan.generateMacroPlan).mockClear();
    saveBaselineMock.mockClear();
  });

  it("avvia l'intervista con il primo messaggio e le domande", async () => {
    generateMock.mockResolvedValue({
      data: turn(),
      provider: "deepseek",
      model: "deepseek-flash",
      usage: {},
      latencyMs: 10,
    });

    const interview = await service().start("user-1");

    expect(interview.status).toBe("active");
    expect(interview.messages).toHaveLength(1);
    expect(interview.messages[0]?.role).toBe("assistant");
    expect(interview.questions[0]?.id).toBe("gym_purpose");
    expect(docs).toHaveLength(1);
  });

  it("raccoglie i findings e chiude l'intervista quando è pronta", async () => {
    generateMock
      .mockResolvedValueOnce({
        data: turn(),
        provider: "deepseek",
        model: "deepseek-flash",
        usage: {},
        latencyMs: 10,
      })
      .mockResolvedValueOnce({
        data: turn({
          reply: "Perfetto, ho tutto.",
          findings: { gymPurpose: "general_fitness", plyometricsAvailable: true },
          questions: [],
          readyToPlan: true,
        }),
        provider: "deepseek",
        model: "deepseek-flash",
        usage: {},
        latencyMs: 10,
      });

    const instance = service();
    const started = await instance.start("user-1");
    const updated = await instance.message("user-1", started.id, "Fitness generale");

    expect(updated.status).toBe("ready");
    expect(updated.findings).toMatchObject({
      gymPurpose: "general_fitness",
      plyometricsAvailable: true,
    });
    expect(updated.messages).toHaveLength(3);
  });

  it("rivaluta la metodologia e genera il piano con i findings", async () => {
    generateMock
      .mockResolvedValueOnce({
        data: turn(),
        provider: "deepseek",
        model: "deepseek-flash",
        usage: {},
        latencyMs: 10,
      })
      .mockResolvedValueOnce({
        data: turn({
          reply: "Ho tutto.",
          findings: { gymPurpose: "general_fitness" },
          questions: [],
          readyToPlan: true,
        }),
        provider: "deepseek",
        model: "deepseek-flash",
        usage: {},
        latencyMs: 10,
      });

    const instance = service();
    const started = await instance.start("user-1");
    await instance.message("user-1", started.id, "Fitness generale");
    const result = await instance.generate("user-1", started.id);

    expect(methodology.evaluate).toHaveBeenCalledWith("user-1", {
      gymPurpose: "general_fitness",
    });
    expect(plan.generateMacroPlan).toHaveBeenCalledWith("user-1", {});
    expect(result.interview.status).toBe("generated");
    expect(result.interview.methodologyId).toBe("methodology_1");
    expect(result.interview.planId).toBe("macro_1");
  });

  it("salva la data target concordata prima di generare", async () => {
    generateMock
      .mockResolvedValueOnce({
        data: turn(),
        provider: "deepseek",
        model: "deepseek-flash",
        usage: {},
        latencyMs: 10,
      })
      .mockResolvedValueOnce({
        data: turn({
          reply: "Data concordata.",
          findings: { targetDate: "2027-02-15" },
          questions: [],
          readyToPlan: true,
        }),
        provider: "deepseek",
        model: "deepseek-flash",
        usage: {},
        latencyMs: 10,
      });

    const instance = service();
    const started = await instance.start("user-1");
    await instance.message("user-1", started.id, "Va bene il 15 febbraio");
    const result = await instance.generate("user-1", started.id);

    expect(saveBaselineMock).toHaveBeenCalledOnce();
    const saved = saveBaselineMock.mock.calls[0]?.[1] as {
      goals: { primary: { targetDate?: string } };
    };
    expect(saved.goals.primary.targetDate).toBe("2027-02-15");
    expect(result.baseline.goals.primary.targetDate).toBe("2027-02-15");
  });
});
