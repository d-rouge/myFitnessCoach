import { describe, expect, it } from "vitest";
import { mapYazioDailySummary, mapYazioWeight } from "./mapper";

const fetchedAt = "2026-10-26T10:00:00.000Z";

const summary = {
  activity_energy: 600,
  consume_activity_energy: true,
  steps: 9000,
  water_intake: 1500,
  goals: {
    "energy.energy": 2200,
    "nutrient.protein": 150,
    "nutrient.carb": 250,
    "nutrient.fat": 70,
    "activity.step": 10000,
    water: 2000,
  },
  meals: {
    breakfast: {
      energy_goal: 500,
      nutrients: {
        "energy.energy": 450,
        "nutrient.protein": 25,
        "nutrient.carb": 50,
        "nutrient.fat": 15,
        "nutrient.fiber": 8,
      },
    },
    lunch: {
      energy_goal: 700,
      nutrients: {
        "energy.energy": 650,
        "nutrient.protein": 40,
        "nutrient.carb": 80,
        "nutrient.fat": 20,
        "nutrient.fiber": 10,
      },
    },
    dinner: {
      energy_goal: 700,
      nutrients: {
        "energy.energy": 600,
        "nutrient.protein": 35,
        "nutrient.carb": 70,
        "nutrient.fat": 18,
        "nutrient.fiber": 9,
      },
    },
    snack: {
      energy_goal: 300,
      nutrients: {
        "energy.energy": 200,
        "nutrient.protein": 10,
        "nutrient.carb": 25,
        "nutrient.fat": 6,
        "nutrient.fiber": 3,
      },
    },
  },
  user: { current_weight: 74.2 },
};

describe("Yazio mapper", () => {
  it("sums meal nutrients and maps goals", () => {
    const result = mapYazioDailySummary(summary, {
      userId: "personal",
      date: "2026-10-25",
      fetchedAt,
    });

    expect(result).toBeDefined();
    expect(result?.nutrition).toMatchObject({
      userId: "personal",
      date: "2026-10-25",
      source: "yazio",
      kcal: 1900,
      proteinG: 110,
      carbsG: 225,
      fatG: 59,
      fiberG: 30,
      waterMl: 1500,
      steps: 9000,
      weightKg: 74.2,
      goalKcal: 2200,
      goalProteinG: 150,
      goalCarbsG: 250,
      goalFatG: 70,
      goalWaterMl: 2000,
      goalSteps: 10000,
    });

    expect(result?.metrics).toMatchObject({
      date: "2026-10-25",
      source: "yazio",
      steps: 9000,
      hydrationMl: 1500,
      weightKg: 74.2,
    });
  });

  it("falls back to top-level nutrients", () => {
    const result = mapYazioDailySummary(
      {
        "energy.energy": 1200,
        "nutrient.protein": 80,
        "nutrient.carb": 100,
        "nutrient.fat": 40,
      },
      { userId: "personal", date: "2026-10-25", fetchedAt },
    );

    expect(result?.nutrition.kcal).toBe(1200);
    expect(result?.nutrition.proteinG).toBe(80);
  });

  it("maps the last weight entry", () => {
    const metrics = mapYazioWeight(
      { date: "2026-10-25 08:00:00", value: 73.8 },
      { userId: "personal", date: "2026-10-26", fetchedAt },
    );

    expect(metrics).toMatchObject({
      date: "2026-10-25",
      source: "yazio",
      weightKg: 73.8,
    });
  });

  it("ignores a missing weight", () => {
    expect(
      mapYazioWeight(null, {
        userId: "personal",
        date: "2026-10-26",
        fetchedAt,
      }),
    ).toBeUndefined();
  });
});
