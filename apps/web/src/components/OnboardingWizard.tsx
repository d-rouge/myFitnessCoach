import {
  type AthleticHistory,
  assessSafety,
  type Baseline,
  beginnerPersona,
  type CapacityEstimate,
  type CurrentCapacity,
  deriveExperienceTier,
  deriveExperienceTierRationale,
  type EquipmentItem,
  experienceTierLabel,
  type GoalType,
  type Injury,
  intermediatePersona,
  kneePainPersona,
  type LongSessionAvailability,
  preserveDeclaredFiveK,
  primarySportOf,
  resolveAvailabilityDays,
  returningPersona,
  type Sex,
  type Sport,
  type Tone,
  type TrainingLevel,
  type Weekday,
} from "@health-trainer/domain";
import { cn } from "@health-trainer/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { apiFetch } from "../lib/api";

export type ProfileFocus = "full" | "health" | "goal" | "training" | "summary";

interface GarminActivitySyncResult {
  status: "ok" | "partial";
  activities: number;
  errors: string[];
}

interface GarminActivitySummary {
  from: string;
  to: string;
  totalActivities: number;
  durationSeconds: number;
  bySport: Array<{ sport: Sport; activities: number; durationSeconds: number }>;
  entries: Array<{
    id: string;
    date: string;
    sport: Sport;
    title: string | null;
    durationSeconds: number;
  }>;
}

async function requestGarminActivitySummary(): Promise<GarminActivitySummary> {
  const response = await apiFetch("/api/integrations/garmin/activities/summary?days=90");
  if (!response.ok) {
    throw new Error(`Lettura del riepilogo Garmin fallita (${response.status})`);
  }
  return (await response.json()) as GarminActivitySummary;
}

const formatActivityDuration = (durationSeconds: number): string => {
  const totalMinutes = Math.round(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
};

const FOCUS_STEPS: Record<ProfileFocus, number[]> = {
  full: [1, 2, 3, 4, 5, 6],
  health: [1, 2],
  goal: [3],
  training: [4, 5],
  summary: [6],
};

interface OnboardingWizardProps {
  initialBaseline?: Baseline | null;
  initialStep?: number;
  focus?: ProfileFocus;
  onSaved: (saved: Baseline) => void;
  onCancel?: () => void;
}

const ALL_SPORTS: { id: Sport; labelEn: string; labelIt: string }[] = [
  { id: "running", labelEn: "Running", labelIt: "Corsa" },
  { id: "cycling", labelEn: "Cycling", labelIt: "Ciclismo" },
  { id: "swimming", labelEn: "Swimming", labelIt: "Nuoto" },
  { id: "strength", labelEn: "Strength / Gym", labelIt: "Forza / Palestra" },
  { id: "mobility", labelEn: "Mobility", labelIt: "Mobilità" },
];

const WEEKDAYS: { id: Weekday; labelEn: string; labelIt: string }[] = [
  { id: "mon", labelEn: "Mon", labelIt: "Lun" },
  { id: "tue", labelEn: "Tue", labelIt: "Mar" },
  { id: "wed", labelEn: "Wed", labelIt: "Mer" },
  { id: "thu", labelEn: "Thu", labelIt: "Gio" },
  { id: "fri", labelEn: "Fri", labelIt: "Ven" },
  { id: "sat", labelEn: "Sat", labelIt: "Sab" },
  { id: "sun", labelEn: "Sun", labelIt: "Dom" },
];

const EQUIPMENT_OPTIONS: { id: EquipmentItem; labelEn: string; labelIt: string }[] = [
  { id: "bodyweight", labelEn: "Bodyweight", labelIt: "A corpo libero" },
  { id: "dumbbells", labelEn: "Dumbbells", labelIt: "Manubri" },
  { id: "barbell", labelEn: "Barbell & plates", labelIt: "Bilanciere e dischi" },
  { id: "kettlebell", labelEn: "Kettlebell", labelIt: "Kettlebell" },
  { id: "resistance_band", labelEn: "Resistance / Loop bands", labelIt: "Elastici / Loop band" },
  { id: "foam_roller", labelEn: "Foam roller", labelIt: "Foam roller" },
  { id: "treadmill", labelEn: "Treadmill", labelIt: "Tapis roulant" },
  { id: "indoor_bike", labelEn: "Stationary bike / Turbo trainer", labelIt: "Cyclette / Rulli" },
  {
    id: "ems",
    labelEn: "EMS device (Compex SP4)",
    labelIt: "Elettrostimolatore (Compex SP4)",
  },
];

interface MedicalFlagOption {
  id: string;
  labelEn: string;
  labelIt: string;
}

const RED_FLAGS: MedicalFlagOption[] = [
  { id: "dolore toracico", labelEn: "Chest pain", labelIt: "Dolore toracico" },
  { id: "sincope o vertigini", labelEn: "Syncope or dizziness", labelIt: "Sincope o vertigini" },
  {
    id: "ipertensione non controllata",
    labelEn: "Uncontrolled hypertension",
    labelIt: "Ipertensione non controllata",
  },
  { id: "chirurgia recente", labelEn: "Recent surgery", labelIt: "Chirurgia recente" },
  {
    id: "sospetta frattura da stress",
    labelEn: "Suspected stress fracture",
    labelIt: "Sospetta frattura da stress",
  },
  {
    id: "disturbo alimentare attivo",
    labelEn: "Active eating disorder",
    labelIt: "Disturbo alimentare attivo",
  },
  {
    id: "febbre o infezione in corso",
    labelEn: "Fever or active infection",
    labelIt: "Febbre o infezione in corso",
  },
];

const CONDITIONS: MedicalFlagOption[] = [
  {
    id: "ipertensione controllata",
    labelEn: "Controlled hypertension",
    labelIt: "Ipertensione controllata",
  },
  {
    id: "ipertensione non controllata",
    labelEn: "Uncontrolled hypertension",
    labelIt: "Ipertensione non controllata",
  },
  { id: "cardiopatia stabile", labelEn: "Stable heart disease", labelIt: "Cardiopatia stabile" },
  { id: "aritmia", labelEn: "Arrhythmia", labelIt: "Aritmia" },
  { id: "asma", labelEn: "Asthma", labelIt: "Asma" },
  { id: "diabete", labelEn: "Diabetes", labelIt: "Diabete" },
  { id: "ipotiroidismo", labelEn: "Hypothyroidism", labelIt: "Ipotiroidismo" },
  { id: "ipertiroidismo", labelEn: "Hyperthyroidism", labelIt: "Ipertiroidismo" },
  { id: "anemia", labelEn: "Anemia", labelIt: "Anemia" },
  { id: "colesterolo alto", labelEn: "High cholesterol", labelIt: "Colesterolo alto" },
  { id: "ernia", labelEn: "Hernia", labelIt: "Ernia" },
  { id: "reflusso", labelEn: "Acid reflux", labelIt: "Reflusso" },
  { id: "emicrania", labelEn: "Migraine", labelIt: "Emicrania" },
  { id: "gravidanza", labelEn: "Pregnancy", labelIt: "Gravidanza" },
  { id: "post parto", labelEn: "Postpartum", labelIt: "Post parto" },
];

const TRAINING_LEVELS: Array<{ id: TrainingLevel; labelEn: string; labelIt: string }> = [
  { id: "none", labelEn: "No structured training", labelIt: "Nessuna pratica strutturata" },
  { id: "amateur", labelEn: "Regular amateur", labelIt: "Amatoriale regolare" },
  { id: "competitive", labelEn: "Competitive", labelIt: "Agonistico" },
  { id: "elite", labelEn: "High level / National", labelIt: "Alto livello / nazionale" },
];

/**
 * Bozza locale dell'onboarding.
 *
 * `sessionStorage` e non `localStorage`: contiene dati sanitari e non deve
 * sopravvivere alla chiusura della scheda. Serve a non perdere il lavoro se si
 * cambia tab, si ricarica la pagina o si esce dal wizard.
 */
const DRAFT_KEY = "health-trainer:baseline-draft:v1";

function readDraft(): Baseline | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Baseline;
    if (!parsed?.profile || !parsed.anamnesis || !parsed.goals || !parsed.availability) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function format5k(seconds: number | null): string {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function parse5k(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2})[:'.](\d{1,2})$/);
  if (!match) return null;
  const minutes = Number.parseInt(match[1] ?? "0", 10);
  const seconds = Number.parseInt(match[2] ?? "0", 10);
  if (seconds >= 60) return null;
  const total = minutes * 60 + seconds;
  return total > 0 ? total : null;
}

const INJURY_STATUSES: Array<{ id: Injury["status"]; labelEn: string; labelIt: string }> = [
  { id: "acute", labelEn: "Acute", labelIt: "Acuto" },
  { id: "recovering", labelEn: "Recovering", labelIt: "In recupero" },
  { id: "chronic", labelEn: "Chronic", labelIt: "Cronico" },
  { id: "resolved", labelEn: "Resolved", labelIt: "Risolto" },
];

export function OnboardingWizard({
  initialBaseline,
  initialStep,
  focus = "full",
  onSaved,
  onCancel,
}: OnboardingWizardProps) {
  const { t, locale } = useI18n();
  const visibleSteps = FOCUS_STEPS[focus];
  const [step, setStep] = useState<number>(() => {
    const requested = initialStep ?? visibleSteps[0] ?? 1;
    return visibleSteps.includes(requested) ? requested : (visibleSteps[0] ?? 1);
  });
  const stepIndex = visibleSteps.indexOf(step);
  const previousStep = stepIndex > 0 ? visibleSteps[stepIndex - 1] : null;
  const nextStep =
    stepIndex >= 0 && stepIndex < visibleSteps.length - 1 ? visibleSteps[stepIndex + 1] : null;
  const stepLabel = (value: number): string => {
    const labels =
      locale === "it"
        ? ["Dati fisici", "Salute", "Obiettivo", "Disponibilità", "Attrezzatura", "Riepilogo"]
        : ["Physical data", "Health", "Goal", "Availability", "Equipment", "Summary"];
    return labels[value - 1] ?? `Step ${value}`;
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [baseline, setBaseline] = useState<Baseline>(() => {
    if (initialBaseline) return initialBaseline;
    // Riprende una bozza interrotta invece di ripartire da zero.
    return (
      readDraft() ?? {
        ...beginnerPersona,
        id: `baseline_${Date.now()}`,
        userId: "personal",
      }
    );
  });
  const [draftRestored] = useState<boolean>(() => !initialBaseline && readDraft() !== null);
  // Istantanea del profilo iniziale: "sporco" = diverso da com'era.
  const [initialSnapshot] = useState(() => JSON.stringify(baseline));
  const dirty = JSON.stringify(baseline) !== initialSnapshot;
  // In modifica il profilo esiste già: salvarlo da qualsiasi step è sicuro.
  const isEditing = Boolean(initialBaseline);
  const [injuryDraft, setInjuryDraft] = useState<{
    area: string;
    status: Injury["status"];
    painLevel: number;
  }>({ area: "", status: "recovering", painLevel: 3 });

  useEffect(() => {
    // La bozza serve al primo onboarding; in modifica si salva sul server.
    if (isEditing) return;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(baseline));
    } catch {
      // storage pieno o disabilitato: non bloccare il form
    }
  }, [baseline, isEditing]);

  const [medicationDraft, setMedicationDraft] = useState("");
  const [capacityEstimate, setCapacityEstimate] = useState<CapacityEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // Il riepilogo Garmin vive nella cache di React Query: lo aggiorna sia il sync
  // del profilo sia quello della card Garmin, oltre al refetch periodico.
  const garminSummary = useQuery({
    queryKey: ["garmin-activities-summary"],
    queryFn: requestGarminActivitySummary,
    enabled: baseline.profile.capacity.source === "garmin",
  });
  const garminActivitySummary = garminSummary.data ?? null;
  const garminSummaryLoading = garminSummary.isLoading;
  const garminSummaryError = garminSummary.isError ? garminSummary.error.message : null;
  const [garminSyncing, setGarminSyncing] = useState(false);
  const [garminSyncNotice, setGarminSyncNotice] = useState<string | null>(null);
  const [garminSyncError, setGarminSyncError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/api/baseline/capacity");
        if (!res.ok) return;
        const body = (await res.json()) as CapacityEstimate;
        if (cancelled) return;
        setCapacityEstimate(body);

        // Fresh onboarding with imported data: measure instead of asking.
        if (body.available && !initialBaseline) {
          setBaseline((current) => ({
            ...current,
            profile: {
              ...current.profile,
              // Il tempo 5K dichiarato (es. stima Garmin) non è ricavabile
              // dalle attività: il ricalcolo non deve cancellarlo.
              capacity: preserveDeclaredFiveK(body.capacity, current.profile.capacity),
            },
          }));
        }
      } catch (err) {
        if (!cancelled) setEstimateError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialBaseline]);

  const primarySport = primarySportOf(baseline);
  const historyEntry: AthleticHistory["sports"][number] = baseline.profile.history.sports.find(
    (entry) => entry.sport === primarySport,
  ) ?? {
    sport: primarySport,
    level: "none",
    yearsRegular: 0,
    detrainingMonths: 0,
  };

  const updateHistory = (patch: Partial<AthleticHistory["sports"][number]>) => {
    setBaseline((current) => {
      const others = current.profile.history.sports.filter((e) => e.sport !== primarySport);
      return {
        ...current,
        profile: {
          ...current.profile,
          history: { sports: [...others, { ...historyEntry, ...patch }] },
        },
      };
    });
  };

  const updateCapacity = (patch: Partial<CurrentCapacity>) => {
    setBaseline((current) => ({
      ...current,
      profile: {
        ...current.profile,
        capacity: { ...current.profile.capacity, ...patch },
      },
    }));
  };

  /**
   * Sincronizza gli ultimi 90 giorni e rilegge la capacità. Il riepilogo viene
   * invalidato subito: il totale ore deve aggiornarsi anche se la lettura
   * della capacità fallisce.
   */
  const syncGarminActivities = async () => {
    setGarminSyncing(true);
    setGarminSyncNotice(null);
    setGarminSyncError(null);
    try {
      const syncResponse = await apiFetch("/api/integrations/garmin/sync?days=90", {
        method: "POST",
      });
      const syncResult = (await syncResponse.json()) as GarminActivitySyncResult & {
        message?: string;
      };
      if (!syncResponse.ok) {
        throw new Error(
          syncResult.message ?? `Sincronizzazione Garmin fallita (${syncResponse.status})`,
        );
      }

      await queryClient.invalidateQueries({ queryKey: ["garmin-activities-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["garmin-overview"] });

      const capacityResponse = await apiFetch("/api/baseline/capacity");
      if (!capacityResponse.ok) {
        throw new Error(`Lettura delle attività Garmin fallita (${capacityResponse.status})`);
      }
      const estimate = (await capacityResponse.json()) as CapacityEstimate;
      setCapacityEstimate(estimate);
      if (estimate.available) {
        setBaseline((current) => ({
          ...current,
          profile: {
            ...current.profile,
            capacity: preserveDeclaredFiveK(estimate.capacity, current.profile.capacity),
          },
        }));
      }

      setGarminSyncNotice(
        syncResult.status === "partial"
          ? `${syncResult.activities} attività sincronizzate. Alcuni dati accessori non sono disponibili.`
          : `${syncResult.activities} attività sincronizzate.`,
      );
    } catch (err) {
      setGarminSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setGarminSyncing(false);
    }
  };

  // Valutazione live: l'atleta vede subito se ciò che dichiara blocca il piano.
  const safety = assessSafety({ anamnesis: baseline.anamnesis });

  const derivedTier = deriveExperienceTier({
    history: baseline.profile.history,
    capacity: baseline.profile.capacity,
    sport: primarySport,
  });
  const tierRationale = deriveExperienceTierRationale({
    history: baseline.profile.history,
    capacity: baseline.profile.capacity,
    sport: primarySport,
  });

  const loadPersona = (persona: Baseline) => {
    setBaseline({
      ...persona,
      id: `baseline_${Date.now()}`,
      userId: "personal",
    });
    setError(null);
  };

  const handleSportToggle = (sport: Sport) => {
    const current = baseline.profile.sports;
    const next = current.includes(sport) ? current.filter((s) => s !== sport) : [...current, sport];
    if (next.length === 0) return; // at least 1 sport
    setBaseline({
      ...baseline,
      profile: { ...baseline.profile, sports: next },
    });
  };

  const daysPerWeek = baseline.availability.daysPerWeek ?? baseline.availability.days.length;
  const longSession = baseline.availability.longSession ?? null;

  const updateAvailability = (count: number, nextLong: LongSessionAvailability | null) => {
    setBaseline({
      ...baseline,
      availability: {
        ...baseline.availability,
        daysPerWeek: count,
        longSession: nextLong,
        days: resolveAvailabilityDays({ daysPerWeek: count, longSession: nextLong }),
      },
    });
  };

  const handleLongSessionChange = (choice: string) => {
    if (choice === "none") {
      updateAvailability(daysPerWeek, null);
      return;
    }
    if (choice === "weekend") {
      updateAvailability(daysPerWeek, { when: "weekend", day: null });
      return;
    }
    updateAvailability(daysPerWeek, { when: "weekday", day: longSession?.day ?? "wed" });
  };

  const handleLongSessionDay = (day: Weekday) => {
    updateAvailability(daysPerWeek, { when: "weekday", day });
  };

  const handleEquipmentToggle = (item: EquipmentItem) => {
    const items = baseline.equipment.items;
    const next = items.includes(item) ? items.filter((i) => i !== item) : [...items, item];
    setBaseline({
      ...baseline,
      equipment: { ...baseline.equipment, items: next },
    });
  };

  const handleRedFlagToggle = (flag: string) => {
    const current = baseline.anamnesis.redFlags;
    const next = current.includes(flag)
      ? current.filter((item) => item !== flag)
      : [...current, flag];
    setBaseline({
      ...baseline,
      anamnesis: { ...baseline.anamnesis, redFlags: next },
    });
  };

  const handleConditionToggle = (condition: string) => {
    const current = baseline.anamnesis.conditions;
    const next = current.includes(condition)
      ? current.filter((item) => item !== condition)
      : [...current, condition];
    setBaseline({
      ...baseline,
      anamnesis: { ...baseline.anamnesis, conditions: next },
    });
  };

  const handleAddMedication = () => {
    const medication = medicationDraft.trim();
    if (!medication) return;
    if (baseline.anamnesis.medications.includes(medication)) {
      setMedicationDraft("");
      return;
    }
    setBaseline({
      ...baseline,
      anamnesis: {
        ...baseline.anamnesis,
        medications: [...baseline.anamnesis.medications, medication],
      },
    });
    setMedicationDraft("");
  };

  const handleAddInjury = () => {
    const area = injuryDraft.area.trim();
    if (!area) return;
    setBaseline({
      ...baseline,
      anamnesis: {
        ...baseline.anamnesis,
        injuries: [
          ...baseline.anamnesis.injuries,
          {
            area,
            status: injuryDraft.status,
            painLevel: injuryDraft.painLevel,
            restrictions: [],
          },
        ],
      },
    });
    setInjuryDraft({ area: "", status: "recovering", painLevel: 3 });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await apiFetch("/api/baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseline),
      });

      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? `Errore salvataggio (${res.status})`);
      }

      const saved = (await res.json()) as Baseline;
      try {
        window.sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // niente da fare: la bozza scade con la scheda
      }
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
      {/* Header & Persona Shortcuts */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lime-400">
            {locale === "it"
              ? "Onboarding · Livello 0 (Baseline)"
              : "Onboarding · Level 0 (Baseline)"}
          </span>
          <h2 className="mt-1 text-2xl font-bold text-white">
            {focus !== "full"
              ? stepLabel(step)
              : step === 1
                ? locale === "it"
                  ? "1. Profilo Atleta"
                  : "1. Athlete Profile"
                : step === 2
                  ? locale === "it"
                    ? "2. Anamnesi & Sicurezza"
                    : "2. Medical History & Safety"
                  : step === 3
                    ? locale === "it"
                      ? "3. Obiettivi"
                      : "3. Goals"
                    : step === 4
                      ? locale === "it"
                        ? "4. Disponibilità Settimanale"
                        : "4. Weekly Availability"
                      : step === 5
                        ? locale === "it"
                          ? "5. Attrezzatura & Spazi"
                          : "5. Equipment & Spaces"
                        : locale === "it"
                          ? "6. Riepilogo & Preferenze"
                          : "6. Summary & Preferences"}
          </h2>
        </div>

        {focus === "full" ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">
              {locale === "it" ? "Carica demo:" : "Load demo:"}
            </span>
            <button
              type="button"
              onClick={() => loadPersona(beginnerPersona)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10"
            >
              Marco (5k)
            </button>
            <button
              type="button"
              onClick={() => loadPersona(intermediatePersona)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10"
            >
              Giulia ({locale === "it" ? "Mezza" : "Half"})
            </button>
            <button
              type="button"
              onClick={() => loadPersona(returningPersona)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10"
            >
              Sara ({locale === "it" ? "Rientro" : "Return"})
            </button>
            <button
              type="button"
              onClick={() => loadPersona(kneePainPersona)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10"
            >
              Luca ({locale === "it" ? "Ginocchio" : "Knee"})
            </button>
          </div>
        ) : null}
      </div>

      {/* Steps Progress */}
      {visibleSteps.length > 1 ? (
        <div className="mt-6 flex items-center justify-between gap-2 border-b border-white/5 pb-4 text-xs font-medium text-slate-400">
          {visibleSteps.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStep(s)}
              className={cn(
                "flex flex-1 items-center justify-center rounded-lg py-1.5 transition",
                step === s
                  ? "bg-lime-400 font-bold text-slate-950"
                  : s < step
                    ? "bg-white/10 text-slate-200"
                    : "bg-white/5 text-slate-500",
              )}
            >
              {focus === "full" ? `Step ${s}` : stepLabel(s)}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          {error}
        </div>
      ) : null}

      {/* Step Content */}
      <div className="mt-6">
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-300">
              {t.wizard.step1.birthDate}
              <input
                type="date"
                value={baseline.profile.birthDate}
                onChange={(e) =>
                  setBaseline({
                    ...baseline,
                    profile: { ...baseline.profile, birthDate: e.target.value },
                  })
                }
                className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="block text-xs font-semibold text-slate-300">
              {t.wizard.step1.sex}
              <select
                value={baseline.profile.sex}
                onChange={(e) =>
                  setBaseline({
                    ...baseline,
                    profile: {
                      ...baseline.profile,
                      sex: e.target.value as Sex,
                    },
                  })
                }
                className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                <option value="male">{t.wizard.step1.male}</option>
                <option value="female">{t.wizard.step1.female}</option>
                <option value="other">{t.wizard.step1.other}</option>
                <option value="prefer_not_to_say">
                  {locale === "it" ? "Preferisco non dichiarare" : "Prefer not to say"}
                </option>
              </select>
            </label>

            <label className="block text-xs font-semibold text-slate-300">
              {t.wizard.step1.height}
              <input
                type="number"
                value={baseline.profile.heightCm}
                onChange={(e) =>
                  setBaseline({
                    ...baseline,
                    profile: {
                      ...baseline.profile,
                      heightCm: Number.parseInt(e.target.value, 10) || 170,
                    },
                  })
                }
                className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="block text-xs font-semibold text-slate-300">
              {t.wizard.step1.weight}
              <input
                type="number"
                value={baseline.profile.weightKg}
                onChange={(e) =>
                  setBaseline({
                    ...baseline,
                    profile: {
                      ...baseline.profile,
                      weightKg: Number.parseFloat(e.target.value) || 70,
                    },
                  })
                }
                className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              />
            </label>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-300">
                  {locale === "it"
                    ? `Storia sportiva (${primarySport})`
                    : `Athletic History (${primarySport})`}
                </span>
                <span className="rounded-full bg-lime-400/10 px-3 py-1 text-[11px] font-bold text-lime-300 ring-1 ring-inset ring-lime-400/30">
                  {experienceTierLabel(derivedTier)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{tierRationale}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-semibold text-slate-300">
                  {locale === "it" ? "Livello raggiunto" : "Training level achieved"}
                  <select
                    value={historyEntry.level}
                    onChange={(e) => updateHistory({ level: e.target.value as TrainingLevel })}
                    className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  >
                    {TRAINING_LEVELS.map((level) => (
                      <option key={level.id} value={level.id}>
                        {locale === "it" ? level.labelIt : level.labelEn}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-300">
                  {locale === "it" ? "Anni di pratica" : "Years of practice"}
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={historyEntry.yearsRegular}
                    onChange={(e) =>
                      updateHistory({ yearsRegular: Number.parseInt(e.target.value, 10) || 0 })
                    }
                    className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-300">
                  {locale === "it" ? "Fermo da (mesi)" : "Break duration (months)"}
                  <input
                    type="number"
                    min={0}
                    max={720}
                    value={historyEntry.detrainingMonths}
                    onChange={(e) =>
                      updateHistory({ detrainingMonths: Number.parseInt(e.target.value, 10) || 0 })
                    }
                    className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
            </div>

            {focus === "full" ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-300">
                    {locale === "it"
                      ? `Capacità attuale (${primarySport})`
                      : `Current capacity (${primarySport})`}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-bold ring-1 ring-inset",
                      baseline.profile.capacity.source === "garmin"
                        ? "bg-sky-400/10 text-sky-300 ring-sky-400/30"
                        : baseline.profile.capacity.source === "calibration"
                          ? "bg-amber-400/10 text-amber-300 ring-amber-400/30"
                          : "bg-white/5 text-slate-300 ring-white/10",
                    )}
                  >
                    {baseline.profile.capacity.source === "garmin"
                      ? locale === "it"
                        ? "Da Garmin"
                        : "From Garmin"
                      : baseline.profile.capacity.source === "calibration"
                        ? locale === "it"
                          ? "Settimana di test"
                          : "Test week"
                        : locale === "it"
                          ? "Inserito a mano"
                          : "Manual entry"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {locale === "it"
                    ? "Quello che sai fare oggi, non quello che hai fatto in passato. È questo che decide il carico di partenza."
                    : "What you can currently perform, not your past peak. This sets your initial baseline load."}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void syncGarminActivities()}
                    disabled={garminSyncing}
                    className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-300 transition hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-60"
                  >
                    {garminSyncing
                      ? locale === "it"
                        ? "Sincronizzazione in corso…"
                        : "Syncing…"
                      : locale === "it"
                        ? "Sincronizza Garmin · ultimi 90 giorni"
                        : "Sync Garmin · last 90 days"}
                  </button>
                  <span className="text-[11px] text-slate-400">
                    {locale === "it"
                      ? "Totale ore calcolato dalle attività Garmin, tutti gli sport."
                      : "Total hours from Garmin activities, all sports."}
                  </span>
                </div>

                {garminSyncNotice ? (
                  <p className="mt-2 text-[11px] text-emerald-300" role="status">
                    {garminSyncNotice}
                  </p>
                ) : null}
                {garminSyncError ? (
                  <p className="mt-2 text-[11px] text-rose-300" role="alert">
                    {garminSyncError}
                  </p>
                ) : null}
                {garminSummaryError ? (
                  <p className="mt-2 text-[11px] text-rose-300" role="alert">
                    {garminSummaryError}
                  </p>
                ) : null}

                {garminActivitySummary ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-white/5 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                        {locale === "it" ? "Attività negli ultimi 3 mesi" : "Activities (3 months)"}
                      </div>
                      <div className="text-lg font-bold text-white">
                        {garminActivitySummary.totalActivities}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/5 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                        {locale === "it" ? "Ore totali" : "Total hours"}
                      </div>
                      <div className="text-lg font-bold text-white">
                        {formatActivityDuration(garminActivitySummary.durationSeconds)}
                      </div>
                    </div>
                  </div>
                ) : garminSummaryLoading ? (
                  <p className="mt-2 text-[11px] text-slate-400" role="status">
                    {locale === "it" ? "Caricamento riepilogo Garmin…" : "Loading Garmin summary…"}
                  </p>
                ) : null}

                {baseline.profile.capacity.source === "garmin" && capacityEstimate?.available ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl bg-white/5 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">
                          {locale === "it" ? "Settimane continue" : "Active weeks"}
                        </div>
                        <div className="text-lg font-bold text-white">
                          {baseline.profile.capacity.activeWeeks}
                        </div>
                      </div>
                      <div className="rounded-xl bg-white/5 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">
                          {locale === "it" ? "Sedute / sett." : "Sessions / wk"}
                        </div>
                        <div className="text-lg font-bold text-white">
                          {baseline.profile.capacity.weeklySessions}
                        </div>
                      </div>
                      <div className="rounded-xl bg-white/5 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">
                          {locale === "it" ? "Uscita più lunga" : "Longest session"}
                        </div>
                        <div className="text-lg font-bold text-white">
                          {baseline.profile.capacity.longestRecentSessionMin} min
                        </div>
                      </div>
                      <div className="rounded-xl bg-white/5 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">
                          {locale === "it" ? "5k stimato" : "Est. 5k"}
                        </div>
                        <div className="text-lg font-bold text-white">
                          {format5k(baseline.profile.capacity.recent5kSec)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span>
                        {locale === "it"
                          ? `${capacityEstimate.coverage.activities} attività, ultima ${capacityEstimate.coverage.lastActivityDate ?? "—"}.`
                          : `${capacityEstimate.coverage.activities} activities, latest ${capacityEstimate.coverage.lastActivityDate ?? "—"}.`}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCapacity({ source: "manual" })}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 font-semibold text-slate-200 hover:bg-white/10"
                      >
                        {locale === "it" ? "Modifica a mano" : "Edit manually"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {capacityEstimate?.available ? (
                      <button
                        type="button"
                        onClick={() =>
                          setBaseline({
                            ...baseline,
                            profile: {
                              ...baseline.profile,
                              capacity: preserveDeclaredFiveK(
                                capacityEstimate.capacity,
                                baseline.profile.capacity,
                              ),
                            },
                          })
                        }
                        className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-400/20"
                      >
                        {locale === "it"
                          ? `Usa i dati Garmin (${capacityEstimate.coverage.activities} attività)`
                          : `Use Garmin data (${capacityEstimate.coverage.activities} activities)`}
                      </button>
                    ) : null}

                    <label className="flex items-center gap-3 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={baseline.profile.capacity.source === "calibration"}
                        onChange={(e) =>
                          updateCapacity({ source: e.target.checked ? "calibration" : "manual" })
                        }
                        className="h-4 w-4 rounded border-white/20 bg-white/10 text-lime-400"
                      />
                      <span>
                        {locale === "it" ? (
                          <>
                            Non ho dati né riferimenti: usa la{" "}
                            <strong>settimana 1 come test di capacità</strong> (RPE 4-5, nessun
                            lavoro intenso).
                          </>
                        ) : (
                          <>
                            No baseline data: use{" "}
                            <strong>week 1 as a capacity calibration test</strong> (RPE 4-5, no
                            intense work).
                          </>
                        )}
                      </span>
                    </label>

                    <div className="grid gap-3 sm:grid-cols-4">
                      <label className="block text-xs font-semibold text-slate-300">
                        {locale === "it" ? "Settimane continue" : "Continuous weeks"}
                        <input
                          type="number"
                          min={0}
                          value={baseline.profile.capacity.activeWeeks}
                          onChange={(e) =>
                            updateCapacity({
                              activeWeeks: Number.parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="block text-xs font-semibold text-slate-300">
                        {locale === "it" ? "Sedute / settimana" : "Sessions / week"}
                        <input
                          type="number"
                          min={0}
                          max={14}
                          value={baseline.profile.capacity.weeklySessions}
                          onChange={(e) =>
                            updateCapacity({
                              weeklySessions: Number.parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="block text-xs font-semibold text-slate-300">
                        {locale === "it" ? "Uscita più lunga (min)" : "Longest session (min)"}
                        <input
                          type="number"
                          min={0}
                          value={baseline.profile.capacity.longestRecentSessionMin}
                          onChange={(e) =>
                            updateCapacity({
                              longestRecentSessionMin: Number.parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="block text-xs font-semibold text-slate-300">
                        {locale === "it" ? "5k recente (min:sec)" : "Recent 5k (min:sec)"}
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={locale === "it" ? "es. 25:30" : "e.g. 25:30"}
                          value={
                            baseline.profile.capacity.recent5kSec
                              ? format5k(baseline.profile.capacity.recent5kSec)
                              : ""
                          }
                          onChange={(e) => {
                            const seconds = parse5k(e.target.value);
                            updateCapacity({
                              recent5kSec: seconds,
                              recent5kSource: seconds === null ? undefined : "declared",
                            });
                          }}
                          className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                        />
                        <span className="mt-1 block text-[11px] font-normal text-slate-400">
                          {locale === "it"
                            ? "Puoi usare la stima 5K di Garmin Connect: resta un dato dichiarato e non viene sovrascritta dal ricalcolo."
                            : "You can use the Garmin Connect 5K estimate: it stays a declared value and is not overwritten by recalculation."}
                        </span>
                      </label>
                    </div>
                  </div>
                )}
                {estimateError ? (
                  <p className="mt-2 text-[11px] text-amber-300">
                    {locale === "it"
                      ? `Impossibile leggere i dati Garmin: ${estimateError}`
                      : `Unable to read Garmin data: ${estimateError}`}
                  </p>
                ) : null}
              </div>
            ) : null}

            {focus === "full" ? (
              <div className="sm:col-span-2">
                <span className="block text-xs font-semibold text-slate-300">
                  {locale === "it" ? "Sport praticati" : "Practiced sports"}
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ALL_SPORTS.map((s) => {
                    const active = baseline.profile.sports.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSportToggle(s.id)}
                        className={cn(
                          "rounded-xl px-3 py-2 text-xs font-medium transition",
                          active
                            ? "bg-lime-400 font-bold text-slate-950"
                            : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                        )}
                      >
                        {locale === "it" ? s.labelIt : s.labelEn}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <label className="flex items-center gap-3 text-sm text-white">
                <input
                  type="checkbox"
                  checked={baseline.anamnesis.parqCleared}
                  onChange={(e) =>
                    setBaseline({
                      ...baseline,
                      anamnesis: {
                        ...baseline.anamnesis,
                        parqCleared: e.target.checked,
                      },
                    })
                  }
                  className="h-4 w-4 rounded border-white/20 bg-white/10 text-lime-400"
                />
                <span>
                  <strong>{t.wizard.step2.parqTitle}:</strong> {t.wizard.step2.parqQuestion}
                </span>
              </label>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <span className="block text-xs font-semibold text-amber-300">
                {t.wizard.step2.redFlagsTitle}
              </span>
              <p className="mt-1 text-xs text-slate-400">{t.wizard.step2.redFlagsDescription}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {RED_FLAGS.map((flag) => {
                  const active = baseline.anamnesis.redFlags.includes(flag.id);
                  return (
                    <button
                      key={flag.id}
                      type="button"
                      onClick={() => handleRedFlagToggle(flag.id)}
                      className={cn(
                        "rounded-xl px-3 py-2 text-xs font-medium transition",
                        active
                          ? "bg-rose-500 font-bold text-white"
                          : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                      )}
                    >
                      {locale === "it" ? flag.labelIt : flag.labelEn}
                    </button>
                  );
                })}
              </div>
              {baseline.anamnesis.redFlags.length > 0 ? (
                <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                  {locale === "it"
                    ? `Hai dichiarato ${baseline.anamnesis.redFlags.length} red flag: la generazione del piano resterà bloccata finché non avrai un nullaosta medico.`
                    : `You reported ${baseline.anamnesis.redFlags.length} red flag(s): plan generation will remain blocked until medical clearance is obtained.`}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <span className="block text-xs font-semibold text-slate-300">
                {t.wizard.step2.conditionsTitle}
              </span>
              <p className="mt-1 text-xs text-slate-400">{t.wizard.step2.conditionsDescription}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {CONDITIONS.map((condition) => {
                  const active = baseline.anamnesis.conditions.includes(condition.id);
                  return (
                    <button
                      key={condition.id}
                      type="button"
                      onClick={() => handleConditionToggle(condition.id)}
                      className={cn(
                        "rounded-xl px-3 py-2 text-xs font-medium transition",
                        active
                          ? "bg-amber-400 font-bold text-slate-950"
                          : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                      )}
                    >
                      {locale === "it" ? condition.labelIt : condition.labelEn}
                    </button>
                  );
                })}
              </div>
              {baseline.anamnesis.conditions.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  {locale === "it"
                    ? "Nessuna patologia dichiarata."
                    : "No health conditions declared."}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <span className="block text-xs font-semibold text-slate-300">
                {t.wizard.step2.medicationsTitle}
              </span>
              <p className="mt-1 text-xs text-slate-400">{t.wizard.step2.medicationsDescription}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={medicationDraft}
                  onChange={(event) => setMedicationDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddMedication();
                    }
                  }}
                  placeholder={t.wizard.step2.medicationPlaceholder}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={handleAddMedication}
                  disabled={medicationDraft.trim().length === 0}
                  className="rounded-xl bg-lime-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"
                >
                  {t.wizard.step2.addMedication}
                </button>
              </div>
              {baseline.anamnesis.medications.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  {locale === "it" ? "Nessun farmaco dichiarato." : "No medications declared."}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {baseline.anamnesis.medications.map((medication) => (
                    <span
                      key={medication}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200"
                    >
                      {medication}
                      <button
                        type="button"
                        onClick={() =>
                          setBaseline({
                            ...baseline,
                            anamnesis: {
                              ...baseline.anamnesis,
                              medications: baseline.anamnesis.medications.filter(
                                (item) => item !== medication,
                              ),
                            },
                          })
                        }
                        className="text-rose-400 hover:text-rose-300"
                        aria-label={`${t.common.delete} ${medication}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {safety.severity !== "ok" ? (
              <div
                className={cn(
                  "rounded-2xl border p-4",
                  safety.severity === "block"
                    ? "border-rose-500/40 bg-rose-500/10"
                    : "border-amber-400/40 bg-amber-400/10",
                )}
              >
                <p
                  className={cn(
                    "text-xs font-bold",
                    safety.severity === "block" ? "text-rose-200" : "text-amber-200",
                  )}
                >
                  {safety.severity === "block"
                    ? t.wizard.step2.safetyBlockedNotice
                    : t.wizard.step2.safetyCautionNotice}
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-200">
                  {safety.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                {safety.requiresMedicalClearance ? (
                  <p className="mt-2 text-xs text-slate-300">
                    {t.wizard.step2.safetyMedicalClearanceNotice}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div>
              <span className="block text-xs font-semibold text-slate-300">
                {t.wizard.step2.injuriesTitle}
              </span>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                <input
                  type="text"
                  value={injuryDraft.area}
                  onChange={(event) => setInjuryDraft({ ...injuryDraft, area: event.target.value })}
                  placeholder={t.wizard.step2.injuryAreaPlaceholder}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                />
                <select
                  value={injuryDraft.status}
                  onChange={(event) =>
                    setInjuryDraft({
                      ...injuryDraft,
                      status: event.target.value as Injury["status"],
                    })
                  }
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                >
                  {INJURY_STATUSES.map((status) => (
                    <option key={status.id} value={status.id}>
                      {locale === "it" ? status.labelIt : status.labelEn}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                  {t.wizard.step2.injuryPain}
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={injuryDraft.painLevel}
                    onChange={(event) =>
                      setInjuryDraft({
                        ...injuryDraft,
                        painLevel: Math.max(0, Math.min(10, Number(event.target.value) || 0)),
                      })
                    }
                    className="w-12 bg-transparent text-center text-white"
                  />
                  /10
                </label>
                <button
                  type="button"
                  onClick={handleAddInjury}
                  disabled={injuryDraft.area.trim().length === 0}
                  className="rounded-xl bg-lime-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"
                >
                  {t.wizard.step2.addInjury}
                </button>
              </div>
              {baseline.anamnesis.injuries.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  {locale === "it" ? "Nessun infortunio dichiarato." : "No injuries declared."}
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {baseline.anamnesis.injuries.map((inj, idx) => (
                    <div
                      key={inj.area}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3 text-xs"
                    >
                      <div>
                        <strong className="capitalize text-white">
                          {inj.area.replace("_", " ")}
                        </strong>
                        <span className="ml-2 text-slate-400">
                          ({locale === "it" ? "Stato" : "Status"}: {inj.status},{" "}
                          {locale === "it" ? "Dolore" : "Pain"}: {inj.painLevel}/10)
                        </span>
                        {inj.notes ? <p className="mt-1 text-slate-400">{inj.notes}</p> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const nextInj = baseline.anamnesis.injuries.filter((_, i) => i !== idx);
                          setBaseline({
                            ...baseline,
                            anamnesis: { ...baseline.anamnesis, injuries: nextInj },
                          });
                        }}
                        className="text-rose-400 hover:text-rose-300"
                      >
                        {t.common.delete}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="block text-xs font-semibold text-slate-300">
              {t.wizard.step2.notesTitle}
              <textarea
                rows={3}
                value={baseline.anamnesis.freeText ?? ""}
                onChange={(e) =>
                  setBaseline({
                    ...baseline,
                    anamnesis: { ...baseline.anamnesis, freeText: e.target.value },
                  })
                }
                placeholder={t.wizard.step2.notesPlaceholder}
                className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white"
              />
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <label className="block text-xs font-semibold text-slate-300">
              {locale === "it" ? "Obiettivo Principale" : "Primary Goal"}
              <input
                type="text"
                value={baseline.goals.primary.description}
                onChange={(e) =>
                  setBaseline({
                    ...baseline,
                    goals: {
                      ...baseline.goals,
                      primary: { ...baseline.goals.primary, description: e.target.value },
                    },
                  })
                }
                placeholder={t.wizard.step3.goalDescriptionPlaceholder}
                className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-300">
                {t.wizard.step3.goalType}
                <select
                  value={baseline.goals.primary.type}
                  onChange={(e) =>
                    setBaseline({
                      ...baseline,
                      goals: {
                        ...baseline.goals,
                        primary: {
                          ...baseline.goals.primary,
                          type: e.target.value as GoalType,
                        },
                      },
                    })
                  }
                  className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <option value="performance">
                    {locale === "it" ? "Performance / Tempo" : "Performance / Time"}
                  </option>
                  <option value="race">{locale === "it" ? "Gara / Evento" : "Race / Event"}</option>
                  <option value="health">
                    {locale === "it" ? "Salute & Benessere" : "Health & Well-being"}
                  </option>
                  <option value="habit">
                    {locale === "it" ? "Costanza / Abitudine" : "Consistency / Habit"}
                  </option>
                  <option value="strength">
                    {locale === "it" ? "Forza / Carico" : "Strength / Load"}
                  </option>
                </select>
              </label>

              <label className="block text-xs font-semibold text-slate-300">
                {t.wizard.step3.targetDate}
                <input
                  type="date"
                  value={baseline.goals.primary.targetDate ?? ""}
                  onChange={(e) =>
                    setBaseline({
                      ...baseline,
                      goals: {
                        ...baseline.goals,
                        primary: {
                          ...baseline.goals.primary,
                          targetDate: e.target.value || undefined,
                        },
                      },
                    })
                  }
                  className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div>
              <span className="block text-xs font-semibold text-slate-300">
                {locale === "it"
                  ? "Quanti giorni a settimana puoi allenarti?"
                  : "How many days per week can you train?"}
              </span>
              <p className="mt-1 text-[11px] text-slate-400">
                {locale === "it"
                  ? "Non serve indicare i minuti: la durata la decide il piano in base al carico."
                  : "No need to enter minutes: the plan decides duration from the load."}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map((count) => (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={daysPerWeek === count}
                    onClick={() => updateAvailability(count, longSession)}
                    className={cn(
                      "rounded-xl px-4 py-2 text-xs font-medium transition",
                      daysPerWeek === count
                        ? "bg-lime-400 font-bold text-slate-950"
                        : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                    )}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                {locale === "it" ? "Giorni proposti: " : "Suggested days: "}
                {baseline.availability.days
                  .map(
                    (day) =>
                      WEEKDAYS.find((weekday) => weekday.id === day.day)?.[
                        locale === "it" ? "labelIt" : "labelEn"
                      ] ?? day.day,
                  )
                  .join(", ")}
                .
              </p>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-300">
                {t.wizard.step4.longSessionDay}
              </span>
              <p className="mt-1 text-[11px] text-slate-400">{t.wizard.step4.longSessionHint}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { value: "none", label: t.wizard.step4.noLongDay },
                  {
                    value: "weekend",
                    label: locale === "it" ? "Sì, nel fine settimana" : "Yes, at the weekend",
                  },
                  {
                    value: "weekday",
                    label: locale === "it" ? "Sì, in un giorno scelto" : "Yes, on a chosen day",
                  },
                ].map((option) => {
                  const selected =
                    option.value === "none"
                      ? longSession === null
                      : option.value === "weekend"
                        ? longSession?.when === "weekend"
                        : longSession?.when === "weekday";
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => handleLongSessionChange(option.value)}
                      className={cn(
                        "rounded-xl px-3 py-2 text-xs font-medium transition",
                        selected
                          ? "bg-lime-400 font-bold text-slate-950"
                          : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {longSession?.when === "weekday" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day.id}
                      type="button"
                      aria-pressed={longSession.day === day.id}
                      onClick={() => handleLongSessionDay(day.id)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                        longSession.day === day.id
                          ? "bg-lime-400 font-bold text-slate-950"
                          : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                      )}
                    >
                      {locale === "it" ? day.labelIt : day.labelEn}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-slate-400">
              {t.wizard.step4.balanceHint}
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white">
                <input
                  type="checkbox"
                  checked={baseline.equipment.gymAccess}
                  onChange={(e) =>
                    setBaseline({
                      ...baseline,
                      equipment: { ...baseline.equipment, gymAccess: e.target.checked },
                    })
                  }
                  className="h-4 w-4 rounded border-white/20 bg-white/10 text-lime-400"
                />
                <span>{t.wizard.step5.gymAccessLabel}</span>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white">
                <input
                  type="checkbox"
                  checked={baseline.equipment.poolAccess}
                  onChange={(e) =>
                    setBaseline({
                      ...baseline,
                      equipment: { ...baseline.equipment, poolAccess: e.target.checked },
                    })
                  }
                  className="h-4 w-4 rounded border-white/20 bg-white/10 text-lime-400"
                />
                <span>{locale === "it" ? "Accesso a piscina" : "Swimming pool access"}</span>
              </label>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-300">
                {t.wizard.step5.equipmentTitle}
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {EQUIPMENT_OPTIONS.map((item) => {
                  const active = baseline.equipment.items.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleEquipmentToggle(item.id)}
                      className={cn(
                        "rounded-xl px-3 py-1.5 text-xs font-medium transition",
                        active
                          ? "bg-lime-400 font-bold text-slate-950"
                          : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                      )}
                    >
                      {locale === "it" ? item.labelIt : item.labelEn}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-lime-400/20 bg-lime-400/5 p-4 text-xs text-lime-200">
              <h3 className="font-bold text-white">
                {locale === "it"
                  ? "Ecco cosa ho capito (Riepilogo Baseline L0):"
                  : "Baseline L0 Profile Summary:"}
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>
                  <strong>{locale === "it" ? "Atleta:" : "Athlete:"}</strong> {baseline.profile.sex}
                  , {baseline.profile.heightCm} cm, {baseline.profile.weightKg} kg,{" "}
                  {locale === "it" ? "livello" : "tier"}{" "}
                  <strong>{experienceTierLabel(derivedTier)}</strong> (
                  {baseline.profile.capacity.source === "garmin"
                    ? locale === "it"
                      ? "capacità misurata da Garmin"
                      : "capacity from Garmin"
                    : baseline.profile.capacity.source === "calibration"
                      ? locale === "it"
                        ? "settimana 1 di calibrazione"
                        : "week 1 calibration"
                      : locale === "it"
                        ? "capacità inserita a mano"
                        : "manually provided"}
                  ).
                </li>
                <li>
                  <strong>{locale === "it" ? "Sport:" : "Sports:"}</strong>{" "}
                  {baseline.profile.sports
                    .map((s) =>
                      locale === "it"
                        ? (ALL_SPORTS.find((sp) => sp.id === s)?.labelIt ?? s)
                        : (ALL_SPORTS.find((sp) => sp.id === s)?.labelEn ?? s),
                    )
                    .join(", ")}
                  .
                </li>
                <li>
                  <strong>{locale === "it" ? "Obiettivo:" : "Goal:"}</strong>{" "}
                  {baseline.goals.primary.description}.
                </li>
                <li>
                  <strong>{locale === "it" ? "Disponibilità:" : "Availability:"}</strong>{" "}
                  {baseline.availability.days.length}{" "}
                  {locale === "it" ? "giorni/settimana" : "days/week"} (
                  {baseline.availability.days.map((d) => d.day.toUpperCase()).join(", ")}).
                </li>
                <li>
                  <strong>{locale === "it" ? "Salute:" : "Health & Safety:"}</strong>{" "}
                  {baseline.anamnesis.injuries.length === 0
                    ? locale === "it"
                      ? "Nessun infortunio"
                      : "No active injuries"
                    : baseline.anamnesis.injuries
                        .map(
                          (i) =>
                            `${i.area} (${locale === "it" ? "dolore" : "pain"} ${i.painLevel}/10)`,
                        )
                        .join(", ")}
                  .
                </li>
              </ul>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-300">
                {locale === "it" ? "Unità di misura" : "Measurement units"}
                <select
                  value={baseline.preferences.units}
                  onChange={(e) =>
                    setBaseline({
                      ...baseline,
                      preferences: {
                        ...baseline.preferences,
                        units: e.target.value as "metric" | "imperial",
                      },
                    })
                  }
                  className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <option value="metric">
                    {locale === "it" ? "Metrico (km, kg, cm)" : "Metric (km, kg, cm)"}
                  </option>
                  <option value="imperial">
                    {locale === "it" ? "Imperiale (mi, lb, ft)" : "Imperial (mi, lb, ft)"}
                  </option>
                </select>
              </label>

              <label className="block text-xs font-semibold text-slate-300">
                {locale === "it" ? "Tono del coach" : "Coach tone"}
                <select
                  value={baseline.preferences.tone}
                  onChange={(e) =>
                    setBaseline({
                      ...baseline,
                      preferences: {
                        ...baseline.preferences,
                        tone: e.target.value as Tone,
                      },
                    })
                  }
                  className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <option value="direct">
                    {locale === "it" ? "Diretto ed essenziale" : "Direct & concise"}
                  </option>
                  <option value="supportive">
                    {locale === "it" ? "Incoraggiante ed empatico" : "Supportive & empathetic"}
                  </option>
                  <option value="analytical">
                    {locale === "it" ? "Analitico e scientifico" : "Analytical & data-driven"}
                  </option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      {draftRestored && !isEditing ? (
        <p className="mt-4 rounded-xl border border-sky-400/30 bg-sky-400/10 p-3 text-xs text-sky-200">
          {t.wizard.draftRestoredNotice}
        </p>
      ) : null}

      {/* Navigation Buttons */}
      <div className="sticky bottom-0 z-10 -mx-6 mt-8 flex items-center justify-between gap-3 rounded-b-3xl border-t border-white/10 bg-slate-900/95 px-6 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        {previousStep !== null ? (
          <button
            type="button"
            onClick={() => setStep(previousStep)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            {t.common.back}
          </button>
        ) : onCancel ? (
          <button
            type="button"
            onClick={() => {
              if (dirty && !window.confirm(t.wizard.confirmExit)) {
                return;
              }
              onCancel?.();
            }}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-white/10"
          >
            {t.common.cancel}
          </button>
        ) : (
          <div />
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty ? (
            <span className="mr-1 text-[11px] font-medium text-amber-300">
              {t.wizard.unsavedChangesBadge}
            </span>
          ) : null}

          {isEditing && nextStep !== null ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="rounded-xl border border-lime-400/40 bg-lime-400/10 px-4 py-2 text-xs font-bold text-lime-300 transition hover:bg-lime-400/20 disabled:opacity-50"
            >
              {isSubmitting
                ? t.common.saving
                : locale === "it"
                  ? "Salva modifiche"
                  : "Save changes"}
            </button>
          ) : null}

          {nextStep !== null ? (
            <button
              type="button"
              onClick={() => setStep(nextStep)}
              className="rounded-xl bg-lime-400 px-5 py-2 text-xs font-bold text-slate-950 transition hover:bg-lime-300"
            >
              {t.common.next}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="rounded-xl bg-lime-400 px-6 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-lime-400/20 transition hover:bg-lime-300 disabled:opacity-50"
            >
              {isSubmitting
                ? t.common.saving
                : isEditing
                  ? locale === "it"
                    ? "Salva modifiche"
                    : "Save changes"
                  : t.wizard.saveBaseline}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
