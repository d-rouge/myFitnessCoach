import { describe, expect, it } from "vitest";
import { GoalSchema } from "../schemas/goal";
import { inferGoalType, withInferredGoalTypes } from "./goal";

describe("inferGoalType", () => {
  it("riconosce una gara esplicita", () => {
    expect(inferGoalType("Correre la mezza maratona di Roma")).toBe("race");
    expect(inferGoalType("Preparare un trail di 30 km")).toBe("race");
  });

  it("tratta i target di tempo come performance, non come gara", () => {
    expect(inferGoalType("Completare un 5k in meno di 23 minuti")).toBe("performance");
    expect(inferGoalType("Abbassare il PB sui 10 km")).toBe("performance");
  });

  it("riconosce composizione corporea, forza e abitudine", () => {
    expect(inferGoalType("Perdere 4 kg di grasso")).toBe("body_composition");
    expect(inferGoalType("Aumentare la forza in palestra")).toBe("strength");
    expect(inferGoalType("Allenarmi con costanza 3 volte a settimana")).toBe("habit");
  });

  it("usa performance come fallback", () => {
    expect(inferGoalType("Stare meglio")).toBe("performance");
    expect(inferGoalType("")).toBe("performance");
  });
});

describe("withInferredGoalTypes", () => {
  it("riallinea il tipo alla descrizione anche se il client ne manda un altro", () => {
    const primary = GoalSchema.parse({
      type: "health",
      description: "Completare un 5k in meno di 23 minuti",
    });
    const secondary = GoalSchema.parse({
      type: "performance",
      description: "Correre la maratona di Venezia",
      priority: "secondary",
    });

    const result = withInferredGoalTypes({ primary, secondary: [secondary] });

    expect(result.primary.type).toBe("performance");
    expect(result.secondary[0]?.type).toBe("race");
  });
});
