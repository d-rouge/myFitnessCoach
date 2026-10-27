import type { MicroPlan } from "@health-trainer/domain";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MongoService } from "../database/mongo.service.js";
import { ExportController } from "./export.controller.js";

const runningSession = {
  id: "sess_run",
  date: "2026-10-27",
  sport: "running" as const,
  type: "aerobic_base",
  title: "Corsa facile",
  durationMin: 45,
  intensity: { mode: "rpe" as const, rpe: 5 },
  blocks: [],
  equipment: [],
  location: "outdoor" as const,
  alternatives: [],
  contraindications: [],
  status: "planned" as const,
};

const strengthSession = {
  ...runningSession,
  id: "sess_strength",
  sport: "strength" as const,
  type: "full_body_strength",
  title: "Forza A",
  location: "gym" as const,
};

const microPlan: MicroPlan = {
  id: "micro_1",
  macroPlanId: "macro_1",
  weekIndex: 1,
  startDate: "2026-10-26",
  endDate: "2026-11-01",
  focus: "Base",
  weeklyVolumeMin: 90,
  deload: false,
  sessions: [runningSession, strengthSession],
  rationale: "Rationale",
  flags: [],
};

describe("ExportController Hevy validation", () => {
  let controller: ExportController;

  beforeEach(() => {
    const db = {
      collection: vi.fn().mockReturnValue({
        find: () => ({
          sort: () => ({
            limit: () => ({ next: async () => microPlan }),
          }),
        }),
      }),
    } as unknown as Db;

    controller = new ExportController(
      { getDb: async () => db } as unknown as MongoService,
      { HEVY_API_KEY: undefined } as never,
    );
  });

  const user = { id: "user_marco" } as never;

  it("rejects a non-strength session before complaining about the API key", async () => {
    await expect(controller.exportToHevy(user, { sessionId: "sess_run" })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await expect(controller.exportToHevy(user, { sessionId: "sess_run" })).rejects.toThrow(
      /solo per le sessioni di forza/i,
    );
  });

  it("requires an API key for a valid strength session", async () => {
    await expect(controller.exportToHevy(user, { sessionId: "sess_strength" })).rejects.toThrow(
      /chiave API Hevy non configurata/i,
    );
  });

  it("does not fall back to another session when the requested one is missing", async () => {
    await expect(controller.exportToHevy(user, { sessionId: "missing" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
