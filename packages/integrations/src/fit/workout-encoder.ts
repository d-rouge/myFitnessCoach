import {
  Encoder,
  type FileIdMesg,
  Profile,
  type WorkoutMesg,
  type WorkoutStepMesg,
} from "@garmin/fitsdk";
import type { PlannedSession } from "@health-trainer/domain";

export type WorkoutSport = "running" | "cycling" | "swimming";

export type WorkoutStepIntensity =
  | "warmup"
  | "cooldown"
  | "interval"
  | "recovery"
  | "rest"
  | "active";

export type WorkoutDuration =
  | { type: "time"; seconds: number }
  | { type: "distance"; meters: number }
  | { type: "open" }
  | { type: "repeat"; repeatCount: number; repeatFromStepIndex: number };

export type WorkoutTarget =
  | { type: "open" }
  | { type: "heartRateZone"; zone: number }
  | { type: "heartRateBpm"; minBpm: number; maxBpm: number }
  | { type: "speed"; minSpeedMs: number; maxSpeedMs: number }
  | { type: "cadence"; minRpm: number; maxRpm: number }
  | { type: "power"; minWatts: number; maxWatts: number };

export interface WorkoutStepDef {
  name: string;
  intensity: WorkoutStepIntensity;
  duration: WorkoutDuration;
  target?: WorkoutTarget;
  notes?: string;
}

export interface WorkoutDef {
  name: string;
  sport: WorkoutSport;
  description?: string;
  steps: WorkoutStepDef[];
}

/**
 * Converts pace in seconds per kilometer to speed in meters per second.
 * E.g. 270 sec/km (4:30/km) -> ~3.704 m/s
 */
export function paceToSpeedMs(secPerKm: number): number {
  if (secPerKm <= 0) throw new Error("Pace in sec/km must be positive");
  return 1000 / secPerKm;
}

/**
 * Parses pace string "M:SS" (e.g. "4:30") into seconds per kilometer.
 */
export function parsePaceStringToSecKm(paceStr: string): number {
  const parts = paceStr.trim().split(":");
  if (parts.length !== 2) {
    throw new Error(`Invalid pace string format "${paceStr}", expected "M:SS"`);
  }
  const minStr = parts[0];
  const secStr = parts[1];
  if (!minStr || !secStr) {
    throw new Error(`Invalid pace string "${paceStr}"`);
  }
  const min = Number.parseInt(minStr, 10);
  const sec = Number.parseInt(secStr, 10);
  if (Number.isNaN(min) || Number.isNaN(sec) || sec < 0 || sec >= 60 || min < 0) {
    throw new Error(`Invalid pace value "${paceStr}"`);
  }
  return min * 60 + sec;
}

/**
 * Encodes a workout definition into a standard Garmin-compatible binary .FIT file.
 */
export function encodeWorkoutToFit(workout: WorkoutDef): Uint8Array {
  if (!workout.name || workout.name.trim().length === 0) {
    throw new Error("Workout name cannot be empty");
  }
  if (!workout.steps || workout.steps.length === 0) {
    throw new Error("Workout must contain at least one step");
  }

  const encoder = new Encoder();

  // 1. FILE_ID
  const fileIdMesg: FileIdMesg = {
    type: "workout",
    manufacturer: "garmin",
    product: 0,
    serialNumber: Math.floor(Date.now() / 1000),
    timeCreated: new Date(),
  };
  encoder.onMesg(Profile.MesgNum.FILE_ID, fileIdMesg);

  // 2. WORKOUT
  const workoutMesg: WorkoutMesg = {
    sport: workout.sport,
    numValidSteps: workout.steps.length,
    wktName: workout.name.slice(0, 32), // Garmin names are usually max 16-32 chars
    wktDescription: workout.description?.slice(0, 100),
  };
  encoder.onMesg(Profile.MesgNum.WORKOUT, workoutMesg);

  // 3. WORKOUT_STEP for each step
  for (let index = 0; index < workout.steps.length; index++) {
    const step = workout.steps[index];
    if (!step) continue;

    const mesg: WorkoutStepMesg = {
      messageIndex: index,
      wktStepName: step.name.slice(0, 16),
      intensity: step.intensity,
      notes: step.notes?.slice(0, 50),
    };

    // Duration mapping
    switch (step.duration.type) {
      case "time":
        mesg.durationType = "time";
        mesg.durationValue = Math.round(step.duration.seconds * 1000);
        break;
      case "distance":
        mesg.durationType = "distance";
        mesg.durationValue = Math.round(step.duration.meters * 100);
        break;
      case "open":
        mesg.durationType = "open";
        mesg.durationValue = 0;
        break;
      case "repeat":
        mesg.durationType = "repeatUntilStepsCmplt";
        mesg.durationValue = step.duration.repeatCount;
        mesg.targetType = "open";
        mesg.targetValue = step.duration.repeatFromStepIndex;
        break;
    }

    // Target mapping (if not repeat step, which uses targetValue for repeat index)
    if (step.duration.type !== "repeat") {
      const target = step.target ?? { type: "open" };
      switch (target.type) {
        case "open":
          mesg.targetType = "open";
          mesg.targetValue = 0;
          break;
        case "heartRateZone":
          mesg.targetType = "heartRate";
          mesg.targetValue = Math.max(1, Math.min(5, Math.round(target.zone)));
          break;
        case "heartRateBpm":
          mesg.targetType = "heartRate";
          mesg.targetValue = 0;
          mesg.customTargetValueLow = Math.round(target.minBpm);
          mesg.customTargetValueHigh = Math.round(target.maxBpm);
          break;
        case "speed":
          mesg.targetType = "speed";
          mesg.targetValue = 0;
          // Scale is 1000 (m/s -> mm/s)
          mesg.customTargetValueLow = Math.round(target.minSpeedMs * 1000);
          mesg.customTargetValueHigh = Math.round(target.maxSpeedMs * 1000);
          break;
        case "cadence":
          mesg.targetType = "cadence";
          mesg.targetValue = 0;
          mesg.customTargetValueLow = Math.round(target.minRpm);
          mesg.customTargetValueHigh = Math.round(target.maxRpm);
          break;
        case "power":
          mesg.targetType = "power";
          mesg.targetValue = 0;
          mesg.customTargetValueLow = Math.round(target.minWatts);
          mesg.customTargetValueHigh = Math.round(target.maxWatts);
          break;
      }
    }

    encoder.onMesg(Profile.MesgNum.WORKOUT_STEP, mesg);
  }

  return encoder.close();
}

/**
 * Creates a standard 5×800m interval running workout definition.
 * - Warm up: 10 min easy (open or zone 2)
 * - 800m interval: target pace 4:15 - 4:35/km (approx 3.63 - 3.92 m/s)
 * - 200m recovery: easy jog
 * - Repeat 5x back to step 1
 * - Cool down: 10 min easy jog
 */
export function create5x800mWorkout(options?: {
  warmupMinutes?: number;
  cooldownMinutes?: number;
  fastPaceSecKm?: number;
  slowPaceSecKm?: number;
}): WorkoutDef {
  const warmupSec = (options?.warmupMinutes ?? 10) * 60;
  const cooldownSec = (options?.cooldownMinutes ?? 10) * 60;
  const fastPace = options?.fastPaceSecKm ?? 255; // 4:15/km
  const slowPace = options?.slowPaceSecKm ?? 275; // 4:35/km

  const minSpeedMs = paceToSpeedMs(slowPace); // slower pace = lower speed
  const maxSpeedMs = paceToSpeedMs(fastPace); // faster pace = higher speed

  return {
    name: "5x800m Ripetute",
    sport: "running",
    description: "5 ripetute da 800m con 200m di recupero attivo",
    steps: [
      {
        name: "Riscaldamento",
        intensity: "warmup",
        duration: { type: "time", seconds: warmupSec },
        target: { type: "heartRateZone", zone: 2 },
        notes: "Corsa lenta di attivazione",
      },
      {
        name: "800m Ripetuta",
        intensity: "interval",
        duration: { type: "distance", meters: 800 },
        target: { type: "speed", minSpeedMs, maxSpeedMs },
        notes: "Ritmo target 4:15 - 4:35/km",
      },
      {
        name: "200m Recupero",
        intensity: "recovery",
        duration: { type: "distance", meters: 200 },
        target: { type: "open" },
        notes: "Corsa blanda o camminata",
      },
      {
        name: "Ripeti 5x",
        intensity: "interval",
        duration: {
          type: "repeat",
          repeatCount: 5,
          repeatFromStepIndex: 1, // Repeat steps 1 and 2
        },
      },
      {
        name: "Defaticamento",
        intensity: "cooldown",
        duration: { type: "time", seconds: cooldownSec },
        target: { type: "heartRateZone", zone: 1 },
        notes: "Corsa facile di scarico",
      },
    ],
  };
}

export function sessionToWorkoutDef(session: PlannedSession): WorkoutDef {
  const sport = workoutSportFor(session);
  const steps: WorkoutStepDef[] = [];

  if (session.blocks.length > 0) {
    for (const block of session.blocks) {
      const startIndex = steps.length;
      for (const [stepIndex, step] of block.steps.entries()) {
        const intensity: WorkoutStepIntensity =
          step.kind === "warmup"
            ? "warmup"
            : step.kind === "cooldown"
              ? "cooldown"
              : step.kind === "recovery"
                ? "recovery"
                : "interval";

        const duration: WorkoutDuration = step.distanceM
          ? { type: "distance", meters: step.distanceM }
          : { type: "time", seconds: (step.durationMin ?? 10) * 60 };

        const parsedTarget = parseTextTarget(step.target);

        steps.push({
          name: stepName(step.kind, stepIndex, step.distanceM),
          intensity,
          duration,
          target: parsedTarget.target,
          notes: joinNotes(step.target, step.notes),
        });
      }

      if (block.repeat > 1 && steps.length > startIndex) {
        steps.push({
          name: `Ripeti ${block.repeat}x`,
          intensity: "interval",
          duration: {
            type: "repeat",
            repeatCount: block.repeat,
            repeatFromStepIndex: startIndex,
          },
        });
      }
    }
  } else {
    const warmupMin = Math.min(10, Math.floor(session.durationMin * 0.2));
    const cooldownMin = Math.min(10, Math.floor(session.durationMin * 0.2));
    const workMin = Math.max(10, session.durationMin - warmupMin - cooldownMin);
    const workTarget = parseTextTarget(session.intensity.target);

    steps.push(
      {
        name: "Riscaldamento Z2",
        intensity: "warmup",
        duration: { type: "time", seconds: warmupMin * 60 },
        target: { type: "heartRateZone", zone: 2 },
      },
      {
        name: session.title.slice(0, 30),
        intensity: "interval",
        duration: { type: "time", seconds: workMin * 60 },
        target: workTarget.target,
        notes: session.intensity.target,
      },
      {
        name: "Defaticamento Z1",
        intensity: "cooldown",
        duration: { type: "time", seconds: cooldownMin * 60 },
        target: { type: "heartRateZone", zone: 1 },
      },
    );
  }

  return {
    name: session.title.slice(0, 50),
    sport,
    description: session.successCriteria ?? session.title,
    steps,
  };
}

const FIT_SPORTS: Record<string, WorkoutSport> = {
  running: "running",
  cycling: "cycling",
  swimming: "swimming",
};

/**
 * Returns the FIT sport for a session, or throws for strength/mobility/other.
 * Silently mapping them to running produced broken Garmin workouts.
 */
export function workoutSportFor(session: PlannedSession): WorkoutSport {
  const sport = FIT_SPORTS[session.sport];
  if (!sport) {
    throw new Error(
      `Export FIT non supportato per lo sport "${session.sport}". Usa l'export Hevy per la palestra o scegli una sessione di corsa, bici o nuoto.`,
    );
  }
  return sport;
}

type StepKind = "warmup" | "work" | "recovery" | "cooldown" | "rest" | "mobility";

function stepName(kind: StepKind, index: number, distanceM?: number): string {
  if (distanceM) return `${distanceM}m ${kind}`;
  const labels: Record<StepKind, string> = {
    warmup: "Riscaldamento",
    work: "Lavoro",
    recovery: "Recupero",
    cooldown: "Defaticamento",
    rest: "Riposo",
    mobility: "Mobilità",
  };
  return `${labels[kind]} ${index + 1}`;
}

function joinNotes(...values: Array<string | undefined>): string | undefined {
  const text = values.filter(Boolean).join(" — ");
  return text.length > 0 ? text.slice(0, 50) : undefined;
}

/**
 * Converts free-text session targets ("Z2", "Passo 4:20-4:35/km", "90-100 rpm",
 * "180-220 W") into structured FIT targets. Unknown text stays as notes.
 */
export function parseTextTarget(text: string | undefined): {
  target: WorkoutTarget;
  notes?: string;
} {
  if (!text) return { target: { type: "open" } };

  const pace = parsePaceTarget(text);
  if (pace) {
    return {
      target: { type: "speed", minSpeedMs: pace.slow, maxSpeedMs: pace.fast },
      notes: text.slice(0, 50),
    };
  }

  const power = /(\d{2,3})\s*[-–]\s*(\d{2,3})\s*w\b/i.exec(text);
  if (power?.[1] && power[2]) {
    return {
      target: {
        type: "power",
        minWatts: Number(power[1]),
        maxWatts: Number(power[2]),
      },
      notes: text.slice(0, 50),
    };
  }

  const cadence = /(\d{2,3})\s*[-–]\s*(\d{2,3})\s*rpm/i.exec(text);
  if (cadence?.[1] && cadence[2]) {
    return {
      target: {
        type: "cadence",
        minRpm: Number(cadence[1]),
        maxRpm: Number(cadence[2]),
      },
      notes: text.slice(0, 50),
    };
  }

  const zone = parseHeartRateZone(text);
  if (zone !== null) {
    return { target: { type: "heartRateZone", zone }, notes: text.slice(0, 50) };
  }

  // RPE and other textual prescriptions cannot be represented in FIT steps.
  return { target: { type: "open" }, notes: text.slice(0, 50) };
}

function parsePaceTarget(text: string): { slow: number; fast: number } | null {
  const range =
    /(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\s*\/?\s*km/i.exec(text) ??
    /(\d{1,2}):(\d{2})\s*\/\s*km/i.exec(text) ??
    /passo\s*(\d{1,2}):(\d{2})/i.exec(text);

  if (!range) return null;

  const first = Number(range[1]) * 60 + Number(range[2]);
  const second = range[3] ? Number(range[3]) * 60 + Number(range[4]) : first;
  const slower = Math.max(first, second);
  const faster = Math.min(first, second);

  return {
    slow: paceToSpeedMs(slower),
    fast: paceToSpeedMs(faster),
  };
}

function parseHeartRateZone(text: string): number | null {
  const range = /z(?:ona)?\s*([1-5])\s*[-–]\s*z?\s*([1-5])/i.exec(text);
  if (range?.[1] && range[2]) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    return Math.round((low + high) / 2);
  }

  const single = /z(?:ona)?\s*([1-5])\b/i.exec(text);
  if (single?.[1]) return Number(single[1]);

  return null;
}

export function encodeSessionWorkoutFit(session: PlannedSession): Uint8Array {
  const workoutDef = sessionToWorkoutDef(session);
  return encodeWorkoutToFit(workoutDef);
}
