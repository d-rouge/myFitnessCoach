import type { PlannedSession } from "@health-trainer/domain";

export interface HevySet {
  type: "warmup" | "normal" | "failure" | "drop";
  weight_kg?: number;
  reps?: number;
  distance_meters?: number;
  duration_seconds?: number;
  rpe?: number;
}

export interface HevyExercise {
  exercise_template_id: string;
  notes?: string;
  rest_seconds?: number;
  sets: HevySet[];
}

export interface HevyRoutinePayload {
  routine: {
    title: string;
    folder_id: string | null;
    notes?: string;
    exercises: HevyExercise[];
  };
}

export const HEVY_EXERCISE_CATALOG: Record<string, { id: string; name: string }> = {
  squat: { id: "D04AC939", name: "Barbell Back Squat" },
  bench_press: { id: "B49FA91D", name: "Barbell Bench Press" },
  overhead_press: { id: "E6129841", name: "Overhead Press" },
  deadlift: { id: "C30A901F", name: "Barbell Deadlift" },
  romanian_deadlift: { id: "A50B202E", name: "Romanian Deadlift" },
  pull_up: { id: "F8120349", name: "Pull Up" },
  barbell_row: { id: "73A2B119", name: "Barbell Bent Over Row" },
  dumbbell_lunge: { id: "3310AC90", name: "Dumbbell Lunge" },
  plank: { id: "98BA3011", name: "Plank" },
};

export function buildHevyRoutine(session: PlannedSession): HevyRoutinePayload {
  const notes =
    session.successCriteria ??
    `Sessione ${session.type} da health-trainer (RPE target ${session.intensity.rpe ?? 7}/10).`;

  // Default functional exercises if custom blocks not specified
  const exercises: HevyExercise[] = [
    {
      exercise_template_id: HEVY_EXERCISE_CATALOG.squat.id,
      notes: "Riscaldamento progressivo + serie target",
      rest_seconds: 120,
      sets: [
        { type: "warmup", reps: 10, weight_kg: 20 },
        { type: "normal", reps: 8, weight_kg: 50 },
        { type: "normal", reps: 8, weight_kg: 50 },
      ],
    },
    {
      exercise_template_id: HEVY_EXERCISE_CATALOG.bench_press.id,
      notes: "Controlla la discesa (3s) e spingi esplosivo",
      rest_seconds: 90,
      sets: [
        { type: "normal", reps: 8, weight_kg: 40 },
        { type: "normal", reps: 8, weight_kg: 40 },
      ],
    },
    {
      exercise_template_id: HEVY_EXERCISE_CATALOG.barbell_row.id,
      notes: "Schiena neutra, retrazione scapolare",
      rest_seconds: 90,
      sets: [
        { type: "normal", reps: 10, weight_kg: 35 },
        { type: "normal", reps: 10, weight_kg: 35 },
      ],
    },
    {
      exercise_template_id: HEVY_EXERCISE_CATALOG.plank.id,
      notes: "Core compatto",
      rest_seconds: 60,
      sets: [
        { type: "normal", duration_seconds: 45 },
        { type: "normal", duration_seconds: 45 },
      ],
    },
  ];

  return {
    routine: {
      title: session.title.slice(0, 50),
      folder_id: null,
      notes,
      exercises,
    },
  };
}

export function buildSampleFullBodyHevyRoutine(): HevyRoutinePayload {
  return {
    routine: {
      title: "Full Body A — health-trainer",
      folder_id: null,
      notes: "Scheda forza funzionale e catena posteriore con recupero 90-120s.",
      exercises: [
        {
          exercise_template_id: HEVY_EXERCISE_CATALOG.squat.id,
          notes: "Focus stabilità ginocchia",
          rest_seconds: 120,
          sets: [
            { type: "warmup", reps: 10, weight_kg: 20 },
            { type: "normal", reps: 8, weight_kg: 60 },
            { type: "normal", reps: 8, weight_kg: 60 },
            { type: "normal", reps: 8, weight_kg: 60 },
          ],
        },
        {
          exercise_template_id: HEVY_EXERCISE_CATALOG.bench_press.id,
          notes: "Spinta pettorali",
          rest_seconds: 90,
          sets: [
            { type: "normal", reps: 8, weight_kg: 50 },
            { type: "normal", reps: 8, weight_kg: 50 },
            { type: "normal", reps: 8, weight_kg: 50 },
          ],
        },
        {
          exercise_template_id: HEVY_EXERCISE_CATALOG.pull_up.id,
          notes: "A corpo libero o assistito",
          rest_seconds: 90,
          sets: [
            { type: "normal", reps: 6 },
            { type: "normal", reps: 6 },
            { type: "normal", reps: 6 },
          ],
        },
      ],
    },
  };
}

export async function exportHevyRoutine(
  payload: HevyRoutinePayload,
  apiKey?: string,
): Promise<{ success: boolean; message: string; routineId?: string; payload: HevyRoutinePayload }> {
  if (!apiKey) {
    return {
      success: true,
      message:
        "Payload routine Hevy generato con successo (modalità offline / anteprima senza chiave API Hevy Pro).",
      payload,
    };
  }

  const response = await fetch("https://api.hevyapp.com/v1/routines", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      success: false,
      message: `Hevy API error (${response.status}): ${errorText}`,
      payload,
    };
  }

  const result = (await response.json()) as { routine?: { id?: string } };
  return {
    success: true,
    message: "Routine esportata con successo su Hevy!",
    routineId: result.routine?.id,
    payload,
  };
}
