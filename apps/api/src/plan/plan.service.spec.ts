import { beginnerPersona } from "@health-trainer/domain";
import { describe, expect, it } from "vitest";
import type { MongoService } from "../database/mongo.service.js";
import { PlanService } from "./plan.service.js";

describe("PlanService", () => {
  it("throws BadRequestException when generating plan without baseline", async () => {
    const mockMongo = {
      getDb: async () => ({
        collection: () => ({
          findOne: async () => null,
          find: () => ({
            sort: () => ({
              limit: () => ({
                next: async () => null,
              }),
            }),
          }),
        }),
      }),
    } as unknown as MongoService;

    const service = new PlanService(mockMongo);
    await expect(service.generateMacroPlan("user_none")).rejects.toThrow(/Nessuna baseline attiva/);
  });

  it("returns rest day when no microplan exists", async () => {
    const mockMongo = {
      getDb: async () => ({
        collection: () => ({
          find: () => ({
            sort: () => ({
              limit: () => ({
                next: async () => null,
              }),
            }),
          }),
        }),
      }),
    } as unknown as MongoService;

    const service = new PlanService(mockMongo);
    const today = await service.getTodaySession("user_1");

    expect(today.isRestDay).toBe(true);
    expect(today.session).toBeNull();
    expect(today.alternatives).toHaveLength(0);
  });

  it("generates macro plan and week 1 micro plan when baseline exists", async () => {
    interface DocWithUserId {
      userId?: string;
      [key: string]: unknown;
    }

    const memoryDocs: Record<string, DocWithUserId[]> = {
      athlete_baselines: [beginnerPersona],
      athlete_macro_plans: [],
      athlete_micro_plans: [],
    };

    const mockMongo = {
      getDb: async () => ({
        collection: (name: string) => ({
          findOne: async (query: { userId?: string }) =>
            memoryDocs[name]?.find((doc) => doc.userId === query.userId) ?? null,
          find: (query: { userId?: string }) => ({
            sort: () => ({
              limit: () => ({
                next: async () =>
                  memoryDocs[name]?.find((doc) => doc.userId === query.userId) ?? null,
              }),
            }),
          }),
          updateOne: async (_filter: unknown, update: { $set: DocWithUserId }) => {
            memoryDocs[name]?.push(update.$set);
            return { modifiedCount: 1, upsertedCount: 1 };
          },
        }),
      }),
    } as unknown as MongoService;

    const service = new PlanService(mockMongo);
    const result = await service.generateMacroPlan(beginnerPersona.userId, {
      startDate: "2026-11-02",
      totalWeeks: 8,
    });

    expect(result.macroPlan.totalWeeks).toBe(8);
    expect(result.microPlan.weekIndex).toBe(1);
    expect(result.microPlan.sessions.length).toBe(beginnerPersona.availability.days.length);
    expect(memoryDocs.athlete_macro_plans.length).toBeGreaterThan(0);
    expect(memoryDocs.athlete_micro_plans.length).toBeGreaterThan(0);
  });
});
