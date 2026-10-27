import { describe, expect, it } from "vitest";
import type { AthleticHistory, CurrentCapacity } from "../schemas/athletic";
import {
  deriveExperienceTier,
  deriveExperienceTierRationale,
  experienceTierLabel,
  normalizeProfileExperience,
  primarySportOf,
} from "./experience";

const capacity = (patch: Partial<CurrentCapacity> = {}): CurrentCapacity => ({
  activeWeeks: 0,
  weeklySessions: 0,
  longestRecentSessionMin: 0,
  recent5kSec: null,
  source: "manual",
  asOf: null,
  ...patch,
});

const history = (patch: Partial<AthleticHistory["sports"][number]> = {}): AthleticHistory => ({
  sports: [
    {
      sport: "running",
      level: "none",
      yearsRegular: 0,
      detrainingMonths: 0,
      ...patch,
    },
  ],
});

describe("deriveExperienceTier", () => {
  it("classifies a former competitive athlete who stopped two years ago as returning", () => {
    const tier = deriveExperienceTier({
      history: history({ level: "competitive", yearsRegular: 12, detrainingMonths: 24 }),
      // Three weeks back, two easy runs: the engine remembers, the tendons do not.
      capacity: capacity({ activeWeeks: 3, weeklySessions: 2, longestRecentSessionMin: 35 }),
      sport: "running",
    });

    expect(tier).toBe("returning");
  });

  it("does not let history grant the top tier while detrained", () => {
    const tier = deriveExperienceTier({
      history: history({ level: "elite", yearsRegular: 15, detrainingMonths: 18 }),
      capacity: capacity({ activeWeeks: 40, weeklySessions: 5, longestRecentSessionMin: 90 }),
      sport: "running",
    });

    expect(tier).toBe("returning");
  });

  it("classifies a sustained competitive athlete as highly trained", () => {
    const tier = deriveExperienceTier({
      history: history({ level: "competitive", yearsRegular: 10, detrainingMonths: 0 }),
      capacity: capacity({ activeWeeks: 30, weeklySessions: 5, longestRecentSessionMin: 100 }),
      sport: "running",
    });

    expect(tier).toBe("highly_trained");
  });

  it("classifies a late starter with years of regular practice as trained, not highly trained", () => {
    const tier = deriveExperienceTier({
      history: history({ level: "amateur", yearsRegular: 3, detrainingMonths: 0 }),
      capacity: capacity({ activeWeeks: 150, weeklySessions: 4, longestRecentSessionMin: 70 }),
      sport: "running",
    });

    expect(tier).toBe("trained");
  });

  it("classifies a true beginner as novice", () => {
    const tier = deriveExperienceTier({
      history: history({ yearsRegular: 0 }),
      capacity: capacity({ activeWeeks: 4, weeklySessions: 2, longestRecentSessionMin: 30 }),
      sport: "running",
    });

    expect(tier).toBe("novice");
  });

  it("promotes a short-history athlete through current consistency alone", () => {
    const tier = deriveExperienceTier({
      history: history({ level: "amateur", yearsRegular: 1, detrainingMonths: 0 }),
      capacity: capacity({ activeWeeks: 14, weeklySessions: 3, longestRecentSessionMin: 45 }),
      sport: "running",
    });

    expect(tier).toBe("trained");
  });

  it("keeps history specific to the goal sport", () => {
    const tier = deriveExperienceTier({
      history: {
        sports: [{ sport: "swimming", level: "elite", yearsRegular: 12, detrainingMonths: 0 }],
      },
      capacity: capacity({ activeWeeks: 3, weeklySessions: 2, longestRecentSessionMin: 30 }),
      sport: "running",
    });

    expect(tier).toBe("novice");
  });
});

describe("experience helpers", () => {
  it("returns an Italian label for every tier", () => {
    expect(experienceTierLabel("returning")).toMatch(/rientro/i);
    expect(experienceTierLabel("highly_trained")).toMatch(/alto livello/i);
  });

  it("explains a returning athlete in terms of the stop, not the past glory", () => {
    const rationale = deriveExperienceTierRationale({
      history: history({ level: "competitive", yearsRegular: 12, detrainingMonths: 24 }),
      capacity: capacity({ activeWeeks: 3 }),
      sport: "running",
    });

    expect(rationale).toMatch(/fermo da 24 mesi/i);
    expect(rationale).toMatch(/prudente/i);
  });

  it("uses the primary goal sport, falling back to the first declared sport", () => {
    expect(
      primarySportOf({
        goals: { primary: { sport: "cycling" } },
        profile: { sports: ["running"] },
      }),
    ).toBe("cycling");

    expect(primarySportOf({ goals: { primary: {} }, profile: { sports: ["swimming"] } })).toBe(
      "swimming",
    );
  });

  it("normalizes legacy baselines saved with the old experience enum", () => {
    const legacy = normalizeProfileExperience({
      sports: ["running" as const],
      experience: "intermediate" as const,
    });

    expect(legacy.history.sports[0]).toMatchObject({ sport: "running", yearsRegular: 2 });
    expect(legacy.capacity.activeWeeks).toBe(12);
    expect(legacy.experienceTier).toBe("trained");
  });
});
