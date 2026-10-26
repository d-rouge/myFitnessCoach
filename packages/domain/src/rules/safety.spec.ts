import { describe, expect, it } from "vitest";
import type { PlannedSession } from "../schemas/session";
import { assessSafety, filterContraindicatedSessions } from "./safety";

const baseSession: PlannedSession = {
  id: "s1",
  date: "2026-11-03",
  sport: "running",
  type: "interval",
  title: "6x800",
  durationMin: 55,
  intensity: { mode: "pace", target: "4:00/km" },
  blocks: [],
  equipment: [],
  location: "outdoor",
  alternatives: [],
  contraindications: ["knee_pain_acute"],
  status: "planned",
};

describe("safety", () => {
  it("blocks on declared red flags", () => {
    const result = assessSafety({
      anamnesis: {
        conditions: [],
        medications: [],
        injuries: [],
        redFlags: ["dolore toracico"],
        parqCleared: false,
      },
    });

    expect(result.severity).toBe("block");
    expect(result.reasons[0]).toContain("Red flag");
  });

  it("blocks acute pain", () => {
    const result = assessSafety({
      checkin: {
        date: "2026-11-03",
        type: "morning",
        pain: [{ area: "ginocchio dx", intensity: 8, sharp: true }],
      },
    });

    expect(result.severity).toBe("block");
  });

  it("cautions on high soreness", () => {
    const result = assessSafety({
      checkin: {
        date: "2026-11-03",
        type: "morning",
        soreness: 4,
        pain: [],
      },
    });

    expect(result.severity).toBe("caution");
  });

  it("filters contraindicated sessions", () => {
    const result = filterContraindicatedSessions([baseSession], ["knee_pain_acute"]);

    expect(result.allowed).toHaveLength(0);
    expect(result.blocked).toHaveLength(1);
  });
});
