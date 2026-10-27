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

const EXERCISE_PATTERNS: Array<{ key: keyof typeof HEVY_EXERCISE_CATALOG; pattern: RegExp }> = [
  { key: "romanian_deadlift", pattern: /rumen|romanian/i },
  { key: "deadlift", pattern: /stacco|deadlift/i },
  { key: "bench_press", pattern: /panca|bench|push-?up|piegamenti/i },
  { key: "overhead_press", pattern: /overhead|military|lento avanti|spinta sopra/i },
  { key: "pull_up", pattern: /trazion|pull-?up/i },
  { key: "barbell_row", pattern: /remator|\brow\b/i },
  { key: "dumbbell_lunge", pattern: /affond|lunge/i },
  { key: "plank", pattern: /plank/i },
  { key: "squat", pattern: /squat|accosciat/i },
];

function matchExercise(text: string): keyof typeof HEVY_EXERCISE_CATALOG | null {
  for (const { key, pattern } of EXERCISE_PATTERNS) {
    if (pattern.test(text)) return key;
  }
  return null;
}

function strengthSets(session: PlannedSession, exerciseKey: string): HevySet[] {
  const rpe = session.intensity.rpe ?? 7;

  if (exerciseKey === "plank") {
    return [
      { type: "normal", duration_seconds: 45, rpe },
      { type: "normal", duration_seconds: 45, rpe },
    ];
  }

  const reps = rpe >= 8 ? 6 : 8;
  return Array.from({ length: 3 }, () => ({ type: "normal" as const, reps, rpe }));
}

/**
 * Derives Hevy exercises from the strength session blocks when the plan
 * contains exercise names; otherwise falls back to a full-body template.
 */
export function buildHevyRoutine(session: PlannedSession): HevyRoutinePayload {
  const notes =
    session.successCriteria ??
    `Sessione ${session.type} da health-trainer (RPE target ${session.intensity.rpe ?? 7}/10).`;

  const texts = session.blocks.flatMap((block) =>
    block.steps.flatMap((step) => [step.target ?? "", step.notes ?? ""]),
  );

  const found: Array<keyof typeof HEVY_EXERCISE_CATALOG> = [];
  for (const text of texts) {
    for (const part of text.split(/[,;+]/)) {
      const key = matchExercise(part.trim());
      if (key && !found.includes(key)) found.push(key);
    }
  }

  const exerciseKeys =
    found.length > 0 ? found : (["squat", "bench_press", "barbell_row", "plank"] as const);

  const exercises: HevyExercise[] = exerciseKeys.map((key) => {
    const catalogEntry = HEVY_EXERCISE_CATALOG[key];
    return {
      exercise_template_id: catalogEntry.id,
      notes:
        found.length > 0
          ? `Derivato dalla sessione "${session.title}"`
          : `Template full-body per "${session.title}" (nessun esercizio esplicito nel piano)`,
      rest_seconds: key === "plank" ? 60 : 120,
      sets: strengthSets(session, key),
    };
  });

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
      success: false,
      message:
        "Chiave API Hevy non configurata. Imposta HEVY_API_KEY per esportare la routine su Hevy Pro.",
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

  let result: { routine?: { id?: string } };
  try {
    result = (await response.json()) as { routine?: { id?: string } };
  } catch {
    return {
      success: false,
      message: "Hevy API ha restituito una risposta non valida.",
      payload,
    };
  }

  if (!result.routine?.id) {
    return {
      success: false,
      message: "Hevy API non ha restituito l'ID della routine creata.",
      payload,
    };
  }

  return {
    success: true,
    message: "Routine esportata con successo su Hevy!",
    routineId: result.routine.id,
    payload,
  };
}
