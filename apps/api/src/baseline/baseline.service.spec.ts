import type { FiveKProjectionInput } from "@health-trainer/domain";
import { describe, expect, it } from "vitest";
import type { MongoService } from "../database/mongo.service.js";
import { BaselineService } from "./baseline.service.js";

const mockMongo = {
  getDb: async () => Promise.reject(new Error("No DB")),
} as unknown as MongoService;

describe("BaselineService", () => {
  const service = new BaselineService(mockMongo);

  it("evaluates safety of anamnesis", () => {
    const safe = service.evaluateSafety({
      conditions: [],
      medications: [],
      injuries: [],
      redFlags: [],
      parqCleared: true,
    });
    expect(safe.severity).toBe("ok");

    const flagged = service.evaluateSafety({
      conditions: ["uncontrolled hypertension"],
      medications: [],
      injuries: [],
      redFlags: [],
      parqCleared: false,
    });
    expect(flagged.severity).toBe("block");
  });

  it("evaluates 5k feasibility projection", () => {
    const input: FiveKProjectionInput = {
      current5kSec: 1800, // 30:00
      weeks: 12,
      experience: "beginner",
      weeklyVolumeKm: 25,
      adherence: 0.85,
    };

    const projection = service.evaluate5kFeasibility(input);
    expect(projection.projectedSec).toBeLessThan(1800);
    expect(projection.confidence).toBeDefined();
    expect(projection.weeklyImprovementPct).toBeGreaterThan(0);
  });

  it("rejects invalid baseline input on save", async () => {
    await expect(service.save("user-1", { invalid: "data" })).rejects.toThrow();
  });
});
