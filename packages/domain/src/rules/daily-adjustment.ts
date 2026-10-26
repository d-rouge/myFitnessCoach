import type { Checkin } from "../schemas/checkin";
import type { AdjustmentDecision } from "../schemas/daily-state";
import type { PlannedSession } from "../schemas/session";

export interface DailyAdjustmentInput {
  checkin: Checkin;
  session: PlannedSession | null;
  readinessScore?: number;
}

export interface DailyAdjustmentResult {
  decision: AdjustmentDecision;
  rationale: string;
  changes: string[];
  flags: string[];
  adjustedSession?: PlannedSession;
}

export function computeDailyAdjustment(input: DailyAdjustmentInput): DailyAdjustmentResult {
  const { checkin, session, readinessScore } = input;

  if (!session) {
    return {
      decision: "confirm",
      rationale:
        "Nessuna sessione ad alto carico pianificata per oggi. Giornata di riposo confermata.",
      changes: [],
      flags: ["rest_day"],
    };
  }

  const flags: string[] = [];
  const changes: string[] = [];

  // Check 1: Severe / Acute Pain
  const maxPain = checkin.pain.reduce((max, p) => Math.max(max, p.intensity), 0);
  const hasSharpPain = checkin.pain.some((p) => p.sharp);

  if (maxPain >= 7 || (maxPain >= 5 && hasSharpPain)) {
    flags.push("acute_pain_detected");
    const restSession: PlannedSession = {
      ...session,
      sport: "mobility",
      type: "rehab_rest",
      title: "Riposo e Decompressione Articolare (Dolore Acuto)",
      durationMin: 15,
      intensity: { mode: "rpe", rpe: 2, target: "Z1 / Recupero passivo" },
      blocks: [
        {
          repeat: 1,
          steps: [
            {
              kind: "mobility",
              durationMin: 15,
              target: "Esercizi di respirazione e scarico senza carico",
            },
          ],
        },
      ],
      status: "adjusted",
    };

    return {
      decision: "rest",
      rationale: `Rilevato dolore acuto (${maxPain}/10${hasSharpPain ? " trafittivo" : ""}). La sessione prevista viene sostituita con riposo e mobilità passiva per prevenire peggioramenti.`,
      changes: ["Sostituito allenamento principale con riposo/scarico", "Durata ridotta a 15 min"],
      flags,
      adjustedSession: restSession,
    };
  }

  // Check 2: Time availability constraint
  if (checkin.availableTimeMin !== undefined && checkin.availableTimeMin < session.durationMin) {
    flags.push("time_constrained");
    const targetMin = checkin.availableTimeMin;

    // Pick 15 min or 30 min alternative
    const altLabel = targetMin <= 20 ? "Versione 15 min (Espressa)" : "Versione 30 min (Compressa)";
    const alternative =
      session.alternatives.find((a) => a.label.includes(altLabel.slice(0, 15))) ??
      session.alternatives[0];

    const adjustedDur = Math.min(targetMin, Math.max(15, Math.floor(targetMin / 5) * 5));
    const adjustedSession: PlannedSession = {
      ...session,
      title: `${session.title} (${altLabel})`,
      durationMin: adjustedDur,
      blocks: [
        {
          repeat: 1,
          steps: [
            { kind: "warmup", durationMin: 5, target: "Riscaldamento compresso" },
            {
              kind: "work",
              durationMin: Math.max(5, adjustedDur - 10),
              target: "Lavoro fondamentale sintetico",
            },
            { kind: "cooldown", durationMin: 5, target: "Defaticamento rapido" },
          ],
        },
      ],
      status: "adjusted",
    };

    return {
      decision: "swap",
      rationale: `Tempo disponibile (${checkin.availableTimeMin} min) inferiore alla durata prevista (${session.durationMin} min). Sessione compressa a ${adjustedDur} min per preservare la costanza.`,
      changes: [
        `Durata ridotta da ${session.durationMin} min a ${adjustedDur} min`,
        alternative?.changes ?? "Adattamento a tempo ridotto",
      ],
      flags,
      adjustedSession,
    };
  }

  // Check 3: Fatigue, Soreness, or Low Readiness
  const isLowEnergy = (checkin.energy ?? 3) <= 2;
  const isHighSoreness = (checkin.soreness ?? 1) >= 4;
  const isPoorSleep = (checkin.sleepQuality ?? 3) <= 2;
  const isLowReadiness = readinessScore !== undefined && readinessScore < 50;

  if (isLowEnergy || isHighSoreness || isPoorSleep || isLowReadiness) {
    if (isLowEnergy) flags.push("low_energy");
    if (isHighSoreness) flags.push("high_muscle_soreness");
    if (isPoorSleep) flags.push("poor_sleep");
    if (isLowReadiness) flags.push("low_readiness");

    const reducedDur = Math.round(session.durationMin * 0.7);
    const reducedRpe = Math.min(session.intensity.rpe ?? 6, 5);

    const adjustedSession: PlannedSession = {
      ...session,
      title: `${session.title} (Volume & Intensità Ridotti)`,
      durationMin: reducedDur,
      intensity: {
        mode: "rpe",
        rpe: reducedRpe,
        target: "Z2 / Aerobico Rigenerante",
      },
      status: "adjusted",
    };

    changes.push(
      `Durata ridotta da ${session.durationMin} min a ${reducedDur} min (-30%)`,
      `Intensità abbassata a RPE ${reducedRpe}/10 (recupero attivo)`,
    );

    return {
      decision: "reduce",
      rationale: `Indicatori di affaticamento elevato (${[
        isLowEnergy ? "energia bassa" : "",
        isHighSoreness ? "indolenzimento muscolare marcato" : "",
        isPoorSleep ? "sonno scarso" : "",
        isLowReadiness ? `readiness ${readinessScore}` : "",
      ]
        .filter(Boolean)
        .join(
          ", ",
        )}). Sessione ridotta per favorire il recupero senza compromettere la continuità.`,
      changes,
      flags,
      adjustedSession,
    };
  }

  // Normal: Confirm plan
  return {
    decision: "confirm",
    rationale:
      "Tutti gli indicatori fisici e di recupero sono favorevoli. Procedi con la sessione pianificata.",
    changes: [],
    flags: ["ready_to_train"],
    adjustedSession: session,
  };
}
