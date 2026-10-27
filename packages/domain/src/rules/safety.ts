import type { Anamnesis } from "../schemas/anamnesis";
import type { Checkin } from "../schemas/checkin";
import type { PlannedSession } from "../schemas/session";

export type SafetySeverity = "ok" | "caution" | "block";

export interface SafetyAssessment {
  severity: SafetySeverity;
  reasons: string[];
  /** True when a medical clearance must be obtained before training/planning. */
  requiresMedicalClearance: boolean;
}

/**
 * Condizioni che richiedono un parere medico prima di allenare. Sono
 * riconosciute in inglese (id canonici) e in italiano (etichette del wizard):
 * il wizard salva testo leggibile, la sicurezza deve comunque capirlo.
 */
const ABSOLUTE_RED_FLAGS = [
  "chest pain",
  "chest_pain",
  "dolore toracico",
  "syncope",
  "sincope",
  "uncontrolled hypertension",
  "uncontrolled_hypertension",
  "ipertensione non controllata",
  "recent surgery",
  "recent_surgery",
  "chirurgia recente",
  "suspected stress fracture",
  "stress_fracture",
  "frattura da stress",
  "active eating disorder",
  "eating_disorder",
  "disturbo alimentare",
  "fever",
  "febbre",
  "infection",
  "infezione",
];

/**
 * Condizioni croniche che consentono l'allenamento ma richiedono prudenza e
 * una nota esplicita. Non bloccano: alzano la severità a `caution`.
 */
const CAUTION_CONDITIONS = [
  "asma",
  "diabete",
  "ipertensione controllata",
  "cardiopatia stabile",
  "aritmia",
  "gravidanza",
  "post parto",
  "anemia",
  "ipotiroidismo",
  "ipertiroidismo",
  "colesterolo alto",
  "emicrania",
  "reflusso",
  "ernia",
];

/** Farmaci che modificano la risposta all'esercizio. */
const MEDICATION_NOTES: Array<{ matches: string[]; note: string }> = [
  {
    matches: ["betabloccante", "beta-bloccante", "beta bloccante"],
    note: "Beta-bloccanti: la frequenza cardiaca è attenuata, usare RPE invece del battito.",
  },
  {
    matches: ["diuretico"],
    note: "Diuretici: rischio di disidratazione, cura l'idratazione e gli elettroliti.",
  },
  {
    matches: ["anticoagulante", "warfarin", "doac"],
    note: "Anticoagulanti: evitare sport di contatto e cadute.",
  },
  {
    matches: ["insulina", "ipoglicemizzante", "metformina"],
    note: "Terapia ipoglicemizzante: attenzione all'ipoglicemia durante e dopo la seduta.",
  },
];

export function assessSafety(input: {
  anamnesis?: Anamnesis;
  checkin?: Checkin;
}): SafetyAssessment {
  const reasons: string[] = [];
  let severity: SafetySeverity = "ok";
  let requiresMedicalClearance = false;

  const escalate = (next: SafetySeverity) => {
    const order: Record<SafetySeverity, number> = { ok: 0, caution: 1, block: 2 };
    if (order[next] > order[severity]) severity = next;
    if (next === "block") requiresMedicalClearance = true;
  };

  const anamnesis = input.anamnesis;
  if (anamnesis) {
    if (anamnesis.redFlags.length > 0) {
      escalate("block");
      reasons.push(`Red flag dichiarati: ${anamnesis.redFlags.join(", ")}`);
    }

    for (const condition of anamnesis.conditions) {
      const normalized = condition.toLowerCase();
      if (ABSOLUTE_RED_FLAGS.some((flag) => normalized.includes(flag))) {
        escalate("block");
        reasons.push(`Condizione che richiede parere medico: ${condition}`);
        continue;
      }
      if (CAUTION_CONDITIONS.some((entry) => normalized.includes(entry))) {
        escalate("caution");
        reasons.push(`Condizione cronica da considerare: ${condition}`);
      }
    }

    for (const medication of anamnesis.medications) {
      const normalized = medication.toLowerCase();
      for (const entry of MEDICATION_NOTES) {
        if (entry.matches.some((match) => normalized.includes(match))) {
          escalate("caution");
          reasons.push(entry.note);
        }
      }
    }

    for (const injury of anamnesis.injuries) {
      if (injury.status === "acute" && injury.painLevel >= 7) {
        escalate("block");
        reasons.push(`Infortunio acuto con dolore ${injury.painLevel}/10: ${injury.area}`);
      } else if (injury.painLevel >= 4) {
        escalate("caution");
        reasons.push(`Dolore ${injury.painLevel}/10: ${injury.area}`);
      }
    }

    // PAR-Q not passed/declared: training may start only after medical clearance.
    if (anamnesis.parqCleared === false) {
      requiresMedicalClearance = true;
      escalate("caution");
      reasons.push(
        "PAR-Q non superato o non compilato: richiedere idoneità medica prima di iniziare.",
      );
    }
  }

  const checkin = input.checkin;
  if (checkin) {
    for (const pain of checkin.pain) {
      if (pain.intensity >= 7 || pain.sharp) {
        escalate("block");
        reasons.push(
          `Dolore acuto ${pain.intensity}/10${pain.sharp ? " (fitta)" : ""}: ${pain.area}`,
        );
      } else if (pain.intensity >= 4) {
        escalate("caution");
        reasons.push(`Dolore ${pain.intensity}/10: ${pain.area}`);
      }
    }

    if ((checkin.soreness ?? 0) >= 4) {
      escalate("caution");
      reasons.push(`Indolenzimento elevato: ${checkin.soreness}/5`);
    }
  }

  return { severity, reasons, requiresMedicalClearance };
}

export function filterContraindicatedSessions(
  sessions: PlannedSession[],
  restrictions: string[],
): { allowed: PlannedSession[]; blocked: PlannedSession[] } {
  const normalized = new Set(restrictions.map((item) => item.toLowerCase()));
  const allowed: PlannedSession[] = [];
  const blocked: PlannedSession[] = [];

  for (const session of sessions) {
    const conflict = session.contraindications.some((item) => normalized.has(item.toLowerCase()));
    (conflict ? blocked : allowed).push(session);
  }

  return { allowed, blocked };
}
