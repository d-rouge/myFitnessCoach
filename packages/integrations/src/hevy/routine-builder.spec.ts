import type { PlannedSession } from "@health-trainer/domain";
import { describe, expect, it } from "vitest";
import {
  buildHevyRoutine,
  buildSampleFullBodyHevyRoutine,
  exportHevyRoutine,
  HEVY_EXERCISE_CATALOG,
} from "./routine-builder";

const sampleStrengthSession: PlannedSession = {
  id: "session_gym_1",
  date: "2026-10-28",
  sport: "strength",
  type: "full_body_strength",
  title: "Forza Funzionale A",
  durationMin: 50,
  intensity: { mode: "rpe", rpe: 7 },
  blocks: [],
  equipment: ["barbell", "dumbbells"],
  location: "gym",
  alternatives: [],
  contraindications: [],
  status: "planned",
};

describe("Hevy Routine Builder", () => {
  it("builds a valid Hevy routine from a strength planned session", () => {
    const payload = buildHevyRoutine(sampleStrengthSession);

    expect(payload.routine.title).toBe("Forza Funzionale A");
    expect(payload.routine.exercises.length).toBeGreaterThan(0);
    expect(payload.routine.exercises[0].exercise_template_id).toBe(HEVY_EXERCISE_CATALOG.squat.id);
    expect(payload.routine.exercises[0].sets.length).toBeGreaterThan(0);
  });

  it("derives exercises from the session blocks when present", () => {
    const session: PlannedSession = {
      ...sampleStrengthSession,
      blocks: [
        {
          repeat: 3,
          steps: [{ kind: "work", durationMin: 30, target: "Squat, panca, trazioni" }],
        },
      ],
    };

    const payload = buildHevyRoutine(session);
    const ids = payload.routine.exercises.map((exercise) => exercise.exercise_template_id);

    expect(ids).toContain(HEVY_EXERCISE_CATALOG.squat.id);
    expect(ids).toContain(HEVY_EXERCISE_CATALOG.bench_press.id);
    expect(ids).toContain(HEVY_EXERCISE_CATALOG.pull_up.id);
  });

  it("builds sample full body routine for direct export", () => {
    const payload = buildSampleFullBodyHevyRoutine();

    expect(payload.routine.title).toMatch(/Full Body/i);
    expect(payload.routine.exercises.length).toBe(3);
  });

  it("does not claim success when no API key is provided", async () => {
    const payload = buildSampleFullBodyHevyRoutine();
    const result = await exportHevyRoutine(payload);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/chiave API Hevy non configurata/i);
    expect(result.payload.routine.title).toBe(payload.routine.title);
  });
});
