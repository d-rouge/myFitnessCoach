import type { Checkin, PlannedSession } from "@health-trainer/domain";
import { z } from "zod";
import type { LlmProvider, LlmRequest, LlmResponse } from "./index.js";

export const CoachAdviceSchema = z.object({
  headline: z.string(),
  readinessSummary: z.string(),
  workoutFocus: z.string(),
  tips: z.array(z.string()),
  encouragement: z.string(),
  caution: z.string().optional(),
});

export type CoachAdvice = z.infer<typeof CoachAdviceSchema>;

export interface CoachAdviceInput {
  athleteName?: string;
  tone?: "supportive" | "direct" | "analytical" | "minimal";
  session: PlannedSession;
  checkin?: Checkin | null;
  readinessScore?: number;
  readinessBand?: "optimal" | "manageable" | "fatigued" | "impaired";
  injuryAlerts?: string[];
}

export const COACH_PROMPT_VERSION = "coach-advice-v2";

export const COACH_SYSTEM_PROMPT = `Sei un preparatore atletico scientifico e pragmatico per la piattaforma health-trainer.
Analizzi il piano di allenamento della giornata, il check-in mattutino e i marker di readiness.
Fornisci all'atleta un consiglio chiaro, azionabile ed empatico su come affrontare l'allenamento di oggi.
Rispetta rigidamente i vincoli di sicurezza: se c'è dolore a un'articolazione o readiness critica, prescrivi prudenza o scarico.`;

/**
 * Istruzione per il percorso LLM. Deve contenere la parola "json" e un esempio
 * del formato atteso: sono i due requisiti della JSON mode di DeepSeek.
 */
export const COACH_USER_INSTRUCTION = `Analizza i dati dell'atleta e produci il consiglio per la sessione di oggi.
Rispondi con un unico oggetto JSON valido, senza testo fuori dal JSON.
Chiavi richieste: headline, readinessSummary, workoutFocus, encouragement (stringhe),
tips (array di stringhe), caution (stringa opzionale, solo se serve prudenza).
Non formulare diagnosi mediche. Con dolore riferito, riduci il carico e suggerisci di fermarsi.`;

/**
 * Regole per l'uso del contesto recente. Il payload contiene fatti calcolati
 * (non prosa): il modello li racconta, non li ricalcola e non li contraddice.
 */
export const COACH_CONTEXT_RULES = `Il campo recentContext contiene fatti calcolati dalle attività importate:
ultima gara o sforzo lungo, giorni trascorsi, finestra di recupero residua,
carico 7/28 giorni e rapporto acuto/cronico.
- Se postRaceRecovery.active è true, la seduta è di recupero: non prescrivere
  carico, non aggiungere intensità e non suggerire di "recuperare" i minuti persi.
- Nomina esplicitamente lo sforzo recente quando è rilevante ("la maratona di
  due giorni fa"), invece di ripetere genericamente "post-gara".
- Non inventare numeri: se un dato non c'è, non citarlo.
- Se flags contiene load_spike o detraining_gap, riduci il carico o proteggi la
  continuità, e spiegalo con i numeri disponibili.`;

export const COACH_RESPONSE_EXAMPLE = `{"headline":"Sessione pronta: Corsa Facile 40'","readinessSummary":"Recupero nella norma.","workoutFocus":"Mantieni Z2 e cadenza regolare.","tips":["Riscaldamento 5' di camminata veloce."],"encouragement":"Buon lavoro.","caution":"Se il dolore al ginocchio supera 3/10, interrompi."}`;

export function generateDeterministicCoachAdvice(input: CoachAdviceInput): CoachAdvice {
  const {
    session,
    checkin,
    readinessBand = "optimal",
    tone = "supportive",
    injuryAlerts = [],
  } = input;
  const athlete = input.athleteName || "Atleta";

  const painAreas: string[] = [];
  if (checkin?.pain && checkin.pain.length > 0) {
    for (const p of checkin.pain) {
      painAreas.push(`${p.area} (livello ${p.intensity}/10)`);
    }
  }

  let headline = `Pronto per la sessione: ${session.title}`;
  let readinessSummary =
    "Recupero ottimale e parametri stabili. Semaforo verde per spingere come pianificato.";
  let workoutFocus = `Focus: ${session.successCriteria || session.title}.`;
  const tips: string[] = [];
  let caution: string | undefined;

  // Suggerimenti per sport.
  // Si usa `sport`, non `type`: `type` è una stringa libera che il generatore
  // valorizza con valori come "aerobic_base"/"long_run", quindi il vecchio
  // switch su "run"/"cycle" non scattava quasi mai e lasciava `tips` vuoto.
  switch (session.sport) {
    case "running":
      tips.push("Riscaldati con 5' di camminata veloce e mobilità delle anche.");
      tips.push(
        "Mantieni una cadenza fluida (170-180 spm) e busto leggermente inclinato in avanti.",
      );
      break;
    case "strength":
      tips.push("Esegui 1-2 serie di riscaldamento progressivo prima dei carichi di lavoro.");
      tips.push("Controlla la fase eccentrica e respira costantemente durante ogni ripetizione.");
      break;
    case "cycling":
      tips.push("Mantieni una cadenza agile (85-95 rpm) per preservare le ginocchia.");
      tips.push("Idratati a piccoli sorsi ogni 15-20 minuti.");
      break;
    case "swimming":
      tips.push("Cura l'allungamento in scivolamento e il rollio del corpo ad ogni bracciata.");
      break;
    case "mobility":
      tips.push(
        "Concentrati sulla respirazione diaframmatica profonda e non forzare gli angoli di movimento.",
      );
      break;
  }

  // Handle readiness bands & pain
  if (readinessBand === "impaired" || painAreas.length > 0) {
    headline = "Attenzione al recupero: sessione protetta";
    readinessSummary = `Readiness ridotta (${readinessBand}). ${
      painAreas.length > 0
        ? `Segnalato fastidio su: ${painAreas.join(", ")}.`
        : "Sistema nervoso affaticato."
    }`;
    workoutFocus =
      "Priorità assoluta: protezione articolare e recupero attivo. Riduci l'intensità o scegli l'alternativa a basso impatto.";
    caution =
      painAreas.length > 0
        ? `Ferma l'allenamento immediatamente se il dolore su ${painAreas.join(", ")} supera la soglia di allerta.`
        : "Non cercare record oggi; completa solo la porzione a bassa intensità.";
    tips.push(
      "Se avverti qualsiasi fitta, passa all'alternativa di scarico o alla mobilità leggera.",
    );
  } else if (readinessBand === "fatigued") {
    headline = "Carico moderato consigliato";
    readinessSummary = "I parametri indicano stanchezza residua o sonno non ottimale.";
    workoutFocus =
      "Mantieni i ritmi conservativi (zona 2 / RPE moderato), ascolta le sensazioni cardiache.";
    tips.push("Evita sprint finali o sovraccarichi non previsti.");
  }

  if (injuryAlerts.length > 0) {
    caution = `${caution ? `${caution} ` : ""}Ricorda i vincoli storici: ${injuryAlerts.join(", ")}.`;
  }

  // Tone adjustments
  let encouragement = `Buon lavoro ${athlete}! Rispetta le sensazioni del corpo e divertiti.`;
  if (tone === "direct") {
    encouragement = `${athlete}, esegui la sessione come programmato con massima disciplina e precisione.`;
  } else if (tone === "analytical") {
    encouragement = `Monitora frequenza cardiaca e RPE: la costanza nel target di carico massimizza la progressione settimanale.`;
  } else if (tone === "minimal") {
    encouragement = `Focus sulla tecnica.`;
  }

  return {
    headline,
    readinessSummary,
    workoutFocus,
    tips,
    encouragement,
    caution,
  };
}

export class DeterministicCoachProvider implements LlmProvider {
  readonly id = "managed" as const;

  async generate<TSchema extends z.ZodType>(
    request: LlmRequest<TSchema>,
  ): Promise<LlmResponse<z.infer<TSchema>>> {
    const startTime = Date.now();
    let data: unknown;

    if (request.task === "daily" || request.task === "chat") {
      try {
        const parsed = JSON.parse(request.user) as CoachAdviceInput;
        data = generateDeterministicCoachAdvice(parsed);
      } catch {
        data = {
          headline: "Sessione del giorno",
          readinessSummary: "Pronto per l'attività programmata.",
          workoutFocus: "Esegui il piano rispettando i ritmi stabiliti.",
          tips: ["Riscaldamento adeguato prima di iniziare.", "Idratazione costante."],
          encouragement: "Forza e concentrazione!",
        };
      }
    } else {
      data = {};
    }

    const validated = request.schema.parse(data);
    return {
      data: validated,
      provider: this.id,
      model: "deterministic-coach-v1",
      usage: {
        inputTokens: Math.round(request.user.length / 4),
        outputTokens: 120,
        costUsd: 0,
      },
      latencyMs: Date.now() - startTime,
    };
  }
}
