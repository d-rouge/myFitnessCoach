import { describe, expect, it } from "vitest";
import { intermediatePersona } from "../fixtures/personas";
import type { PlanMethodology } from "../schemas/plan";
import { generateMacroPlan, generateMicroPlan } from "./plan-generator";

const methodology = (overrides: Partial<PlanMethodology["structure"]> = {}): PlanMethodology => ({
  name: "Base solida con un richiamo di qualità",
  rationale: "Test della struttura guidata dalla metodologia.",
  structure: {
    sessions: 4,
    qualitySessions: 1,
    longSessionMin: 80,
    strengthSessions: 1,
    plyometrics: false,
    weeklyMinutes: 240,
    ...overrides,
  },
});

describe("generateMicroPlan con metodologia", () => {
  it("rispetta numero di sedute, qualità, lungo e forza", () => {
    const macro = generateMacroPlan(intermediatePersona, { methodology: methodology() });
    const micro = generateMicroPlan(intermediatePersona, macro, 1);

    expect(macro.methodology?.name).toBe(methodology().name);
    expect(micro.sessions).toHaveLength(4);
    expect(micro.sessions.filter((session) => session.sport === "strength")).toHaveLength(1);
    expect(micro.sessions.filter((session) => session.type === "intervals")).toHaveLength(1);

    const long = micro.sessions.find((session) => session.type === "long_run");
    expect(long?.durationMin).toBe(80);
    expect(micro.flags).toContain("methodology_guided");
  });

  it("aggiunge il blocco di pliometria solo quando la metodologia lo consente", () => {
    const withPlyo = generateMacroPlan(intermediatePersona, {
      methodology: methodology({ plyometrics: true, strengthSessions: 2 }),
    });
    const micro = generateMicroPlan(intermediatePersona, withPlyo, 1);
    const strength = micro.sessions.filter((session) => session.sport === "strength");

    expect(strength).toHaveLength(2);
    expect(
      strength.some((session) =>
        session.blocks.some((block) =>
          block.steps.some((step) => step.target?.includes("Pliometria")),
        ),
      ),
    ).toBe(true);
  });

  it("riallinea il volume settimanale al target senza toccare il lungo", () => {
    const withoutTarget = generateMicroPlan(
      intermediatePersona,
      generateMacroPlan(intermediatePersona, {
        methodology: methodology({ weeklyMinutes: undefined }),
      }),
      1,
    );
    const withTarget = generateMicroPlan(
      intermediatePersona,
      generateMacroPlan(intermediatePersona, { methodology: methodology({ weeklyMinutes: 150 }) }),
      1,
    );

    expect(withTarget.weeklyVolumeMin).toBeLessThan(withoutTarget.weeklyVolumeMin);
    expect(withTarget.sessions.find((session) => session.type === "long_run")?.durationMin).toBe(
      80,
    );
  });

  it("dopo la finestra della metodologia riprende qualità e lungo della fase", () => {
    const macro = generateMacroPlan(intermediatePersona, {
      methodology: { ...methodology(), applyThroughWeek: 1 },
    });
    const week2 = generateMicroPlan(intermediatePersona, macro, 2);

    expect(week2.sessions.some((session) => session.type === "intervals")).toBe(true);
    const long = week2.sessions.find((session) => session.type === "long_run");
    expect(long?.durationMin).toBeGreaterThanOrEqual(60);
    expect(week2.flags).toContain("methodology_scope_ended");
  });

  it("usa le fasi del macrociclo definite dall'LLM", () => {
    const withPhases: PlanMethodology = {
      ...methodology(),
      phases: [
        {
          name: "Base",
          startWeek: 1,
          endWeek: 6,
          focus: "Base aerobica",
          volumeShare: 0.8,
          deload: false,
          sessions: 3,
          qualitySessions: 0,
          longSessionMin: 50,
        },
        {
          name: "Sviluppo",
          startWeek: 7,
          endWeek: 16,
          focus: "Sviluppo soglia",
          volumeShare: 1.1,
          deload: false,
          sessions: 4,
          qualitySessions: 1,
          longSessionMin: 70,
        },
        {
          name: "Taper",
          startWeek: 17,
          endWeek: 20,
          focus: "Taper",
          volumeShare: 0.8,
          deload: true,
          sessions: 3,
          qualitySessions: 1,
          longSessionMin: 50,
        },
      ],
    };

    const macro = generateMacroPlan(intermediatePersona, { methodology: withPhases });
    expect(macro.phases.map((phase) => phase.name)).toEqual(["Base", "Sviluppo", "Taper"]);

    const week7 = generateMicroPlan(intermediatePersona, macro, 7);
    expect(week7.sessions.filter((session) => session.type === "intervals")).toHaveLength(1);
    expect(week7.sessions.find((session) => session.type === "long_run")?.durationMin).toBe(70);
  });

  it("non supera i giorni disponibili anche se la metodologia ne chiede di più", () => {
    const macro = generateMacroPlan(intermediatePersona, {
      methodology: methodology({ sessions: 9 }),
    });
    const micro = generateMicroPlan(intermediatePersona, macro, 1);

    expect(micro.sessions.length).toBe(intermediatePersona.availability.days.length);
  });
});
