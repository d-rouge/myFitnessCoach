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
  type PreferredTrainingTime,
  primarySportOf,
  returningPersona,
  type Sex,
  type Sport,
  type Tone,
  type TrainingLevel,
  type Weekday,
} from "@health-trainer/domain";
import { cn } from "@health-trainer/ui";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

interface OnboardingWizardProps {
  initialBaseline?: Baseline | null;
  onSaved: (saved: Baseline) => void;
  onCancel?: () => void;
}

const ALL_SPORTS: { id: Sport; label: string }[] = [
  { id: "running", label: "Corsa" },
  { id: "cycling", label: "Ciclismo" },
  { id: "swimming", label: "Nuoto" },
  { id: "strength", label: "Forza / Palestra" },
  { id: "mobility", label: "Mobilità" },
];

const WEEKDAYS: { id: Weekday; label: string }[] = [
  { id: "mon", label: "Lun" },
  { id: "tue", label: "Mar" },
  { id: "wed", label: "Mer" },
  { id: "thu", label: "Gio" },
  { id: "fri", label: "Ven" },
  { id: "sat", label: "Sab" },
  { id: "sun", label: "Dom" },
];

const EQUIPMENT_OPTIONS: { id: EquipmentItem; label: string }[] = [
  { id: "bodyweight", label: "A corpo libero" },
  { id: "dumbbells", label: "Manubri" },
  { id: "barbell", label: "Bilanciere e dischi" },
  { id: "kettlebell", label: "Kettlebell" },
  { id: "resistance_band", label: "Elastici / Loop band" },
  { id: "foam_roller", label: "Foam roller" },
  { id: "treadmill", label: "Tapis roulant" },
  { id: "indoor_bike", label: "Cyclette / Rulli" },
];

const RED_FLAGS = [
  "dolore toracico",
  "sincope o vertigini",
  "ipertensione non controllata",
  "chirurgia recente",
  "sospetta frattura da stress",
  "disturbo alimentare attivo",
  "febbre o infezione in corso",
];

/**
 * Patologie selezionabili. Le voci che richiedono un parere medico usano le
 * stesse parole riconosciute da `assessSafety`, così il blocco scatta davvero.
 */
const CONDITIONS = [
  "ipertensione controllata",
  "ipertensione non controllata",
  "cardiopatia stabile",
  "aritmia",
  "asma",
  "diabete",
  "ipotiroidismo",
  "ipertiroidismo",
  "anemia",
  "colesterolo alto",
  "ernia",
  "reflusso",
  "emicrania",
  "gravidanza",
  "post parto",
];

const TRAINING_LEVELS: Array<{ id: TrainingLevel; label: string }> = [
  { id: "none", label: "Nessuna pratica strutturata" },
  { id: "amateur", label: "Amatoriale regolare" },
  { id: "competitive", label: "Agonistico" },
  { id: "elite", label: "Alto livello / nazionale" },
];

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

const INJURY_STATUSES: Array<{ id: Injury["status"]; label: string }> = [
  { id: "acute", label: "Acuto" },
  { id: "recovering", label: "In recupero" },
  { id: "chronic", label: "Cronico" },
  { id: "resolved", label: "Risolto" },
];

export function OnboardingWizard({ initialBaseline, onSaved, onCancel }: OnboardingWizardProps) {
  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [baseline, setBaseline] = useState<Baseline>(() => {
    if (initialBaseline) return initialBaseline;
    return {
      ...beginnerPersona,
      id: `baseline_${Date.now()}`,
      userId: "personal",
    };
  });
  const [injuryDraft, setInjuryDraft] = useState<{
    area: string;
    status: Injury["status"];
    painLevel: number;
  }>({ area: "", status: "recovering", painLevel: 3 });

  const [medicationDraft, setMedicationDraft] = useState("");
  const [capacityEstimate, setCapacityEstimate] = useState<CapacityEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);

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
            profile: { ...current.profile, capacity: body.capacity },
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

  const handleDayToggle = (day: Weekday) => {
    const currentDays = baseline.availability.days;
    const exists = currentDays.some((d) => d.day === day);
    const next = exists
      ? currentDays.filter((d) => d.day !== day)
      : [
          ...currentDays,
          {
            day,
            windows: [{ start: "07:00", end: "08:00" }],
            maxDurationMin: 60,
          },
        ];
    if (next.length === 0) return; // at least 1 day
    setBaseline({
      ...baseline,
      availability: { ...baseline.availability, days: next },
    });
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
            Onboarding · Livello 0 (Baseline)
          </span>
          <h2 className="mt-1 text-2xl font-bold text-white">
            {step === 1 && "1. Profilo Atleta"}
            {step === 2 && "2. Anamnesi & Sicurezza"}
            {step === 3 && "3. Obiettivi"}
            {step === 4 && "4. Disponibilità Settimanale"}
            {step === 5 && "5. Attrezzatura & Spazi"}
            {step === 6 && "6. Riepilogo & Preferenze"}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Carica demo:</span>
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
            Giulia (Mezza)
          </button>
          <button
            type="button"
            onClick={() => loadPersona(returningPersona)}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10"
          >
            Sara (Rientro)
          </button>
          <button
            type="button"
            onClick={() => loadPersona(kneePainPersona)}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10"
          >
            Luca (Ginocchio)
          </button>
        </div>
      </div>

      {/* Steps Progress */}
      <div className="mt-6 flex items-center justify-between gap-2 border-b border-white/5 pb-4 text-xs font-medium text-slate-400">
        {[1, 2, 3, 4, 5, 6].map((s) => (
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
            Step {s}
          </button>
        ))}
      </div>

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
              Data di nascita
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
              Sesso biologico
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
                <option value="male">Maschio</option>
                <option value="female">Femmina</option>
                <option value="other">Altro</option>
                <option value="prefer_not_to_say">Preferisco non dichiarare</option>
              </select>
            </label>

            <label className="block text-xs font-semibold text-slate-300">
              Altezza (cm)
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
              Peso attuale (kg)
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
                  Storia sportiva ({primarySport})
                </span>
                <span className="rounded-full bg-lime-400/10 px-3 py-1 text-[11px] font-bold text-lime-300 ring-1 ring-inset ring-lime-400/30">
                  {experienceTierLabel(derivedTier)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{tierRationale}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-semibold text-slate-300">
                  Livello raggiunto
                  <select
                    value={historyEntry.level}
                    onChange={(e) => updateHistory({ level: e.target.value as TrainingLevel })}
                    className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  >
                    {TRAINING_LEVELS.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-300">
                  Anni di pratica
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
                  Fermo da (mesi)
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

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-300">
                  Capacità attuale ({primarySport})
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
                    ? "Da Garmin"
                    : baseline.profile.capacity.source === "calibration"
                      ? "Settimana di test"
                      : "Inserito a mano"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Quello che sai fare oggi, non quello che hai fatto in passato. È questo che decide
                il carico di partenza.
              </p>

              {baseline.profile.capacity.source === "garmin" && capacityEstimate?.available ? (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-white/5 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                        Settimane continue
                      </div>
                      <div className="text-lg font-bold text-white">
                        {baseline.profile.capacity.activeWeeks}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/5 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                        Sedute / sett.
                      </div>
                      <div className="text-lg font-bold text-white">
                        {baseline.profile.capacity.weeklySessions}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/5 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                        Uscita più lunga
                      </div>
                      <div className="text-lg font-bold text-white">
                        {baseline.profile.capacity.longestRecentSessionMin} min
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/5 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">
                        5k stimato
                      </div>
                      <div className="text-lg font-bold text-white">
                        {format5k(baseline.profile.capacity.recent5kSec)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span>
                      {capacityEstimate.coverage.activities} attività, ultima{" "}
                      {capacityEstimate.coverage.lastActivityDate ?? "—"}.
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCapacity({ source: "manual" })}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 font-semibold text-slate-200 hover:bg-white/10"
                    >
                      Modifica a mano
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
                          profile: { ...baseline.profile, capacity: capacityEstimate.capacity },
                        })
                      }
                      className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-400/20"
                    >
                      Usa i dati Garmin ({capacityEstimate.coverage.activities} attività)
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
                      Non ho dati né riferimenti: usa la{" "}
                      <strong>settimana 1 come test di capacità</strong> (RPE 4-5, nessun lavoro
                      intenso).
                    </span>
                  </label>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <label className="block text-xs font-semibold text-slate-300">
                      Settimane continue
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
                      Sedute / settimana
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
                      Uscita più lunga (min)
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
                      5k recente (min:sec)
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="es. 25:30"
                        value={
                          baseline.profile.capacity.recent5kSec
                            ? format5k(baseline.profile.capacity.recent5kSec)
                            : ""
                        }
                        onChange={(e) => updateCapacity({ recent5kSec: parse5k(e.target.value) })}
                        className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                      />
                    </label>
                  </div>
                </div>
              )}
              {estimateError ? (
                <p className="mt-2 text-[11px] text-amber-300">
                  Impossibile leggere i dati Garmin: {estimateError}
                </p>
              ) : null}
            </div>

            <div className="sm:col-span-2">
              <span className="block text-xs font-semibold text-slate-300">Sport praticati</span>
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
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
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
                  <strong>Idoneità all&apos;attività (PAR-Q):</strong> Non ho patologie
                  cardiovascolari note, vertigini o controindicazioni mediche all&apos;esercizio
                  fisico.
                </span>
              </label>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <span className="block text-xs font-semibold text-amber-300">
                Red flag medici (richiedono parere medico)
              </span>
              <p className="mt-1 text-xs text-slate-400">
                Seleziona ciò che ti riguarda: con un red flag attivo il piano non verrà generato.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {RED_FLAGS.map((flag) => {
                  const active = baseline.anamnesis.redFlags.includes(flag);
                  return (
                    <button
                      key={flag}
                      type="button"
                      onClick={() => handleRedFlagToggle(flag)}
                      className={cn(
                        "rounded-xl px-3 py-2 text-xs font-medium transition",
                        active
                          ? "bg-rose-500 font-bold text-white"
                          : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                      )}
                    >
                      {flag}
                    </button>
                  );
                })}
              </div>
              {baseline.anamnesis.redFlags.length > 0 ? (
                <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                  Hai dichiarato {baseline.anamnesis.redFlags.length} red flag: la generazione del
                  piano resterà bloccata finché non avrai un nullaosta medico.
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <span className="block text-xs font-semibold text-slate-300">Patologie note</span>
              <p className="mt-1 text-xs text-slate-400">
                Serve a modulare intensità e recupero. Una patologia non controllata richiede un
                nullaosta medico.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {CONDITIONS.map((condition) => {
                  const active = baseline.anamnesis.conditions.includes(condition);
                  return (
                    <button
                      key={condition}
                      type="button"
                      onClick={() => handleConditionToggle(condition)}
                      className={cn(
                        "rounded-xl px-3 py-2 text-xs font-medium transition",
                        active
                          ? "bg-amber-400 font-bold text-slate-950"
                          : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                      )}
                    >
                      {condition}
                    </button>
                  );
                })}
              </div>
              {baseline.anamnesis.conditions.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">Nessuna patologia dichiarata.</p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <span className="block text-xs font-semibold text-slate-300">Farmaci assunti</span>
              <p className="mt-1 text-xs text-slate-400">
                Alcuni farmaci cambiano la risposta all&apos;esercizio (beta-bloccanti, diuretici,
                anticoagulanti, terapia per il diabete).
              </p>
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
                  placeholder="Es. betabloccante"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={handleAddMedication}
                  disabled={medicationDraft.trim().length === 0}
                  className="rounded-xl bg-lime-400 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"
                >
                  Aggiungi
                </button>
              </div>
              {baseline.anamnesis.medications.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">Nessun farmaco dichiarato.</p>
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
                        aria-label={`Rimuovi ${medication}`}
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
                    ? "Generazione del piano bloccata"
                    : "Allenamento possibile con cautela"}
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-200">
                  {safety.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                {safety.requiresMedicalClearance ? (
                  <p className="mt-2 text-xs text-slate-300">
                    Serve un nullaosta medico prima di generare il piano.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div>
              <span className="block text-xs font-semibold text-slate-300">
                Infortuni, dolori o risentimenti attivi
              </span>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                <input
                  type="text"
                  value={injuryDraft.area}
                  onChange={(event) => setInjuryDraft({ ...injuryDraft, area: event.target.value })}
                  placeholder="Zona (es. ginocchio dx)"
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
                      {status.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                  Dolore
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
                  Aggiungi
                </button>
              </div>
              {baseline.anamnesis.injuries.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">Nessun infortunio dichiarato.</p>
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
                          (Stato: {inj.status}, Dolore: {inj.painLevel}/10)
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
                        Rimuovi
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="block text-xs font-semibold text-slate-300">
              Note libere e contesto clinico
              <textarea
                rows={3}
                value={baseline.anamnesis.freeText ?? ""}
                onChange={(e) =>
                  setBaseline({
                    ...baseline,
                    anamnesis: { ...baseline.anamnesis, freeText: e.target.value },
                  })
                }
                placeholder="Es. Leggero fastidio tendineo dopo uscite lunghe; nessun farmaco assunto."
                className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white"
              />
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <label className="block text-xs font-semibold text-slate-300">
              Obiettivo Principale
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
                placeholder="Es. Completare 5k in meno di 28 minuti"
                className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-300">
                Tipo di obiettivo
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
                  <option value="performance">Performance / Tempo</option>
                  <option value="race">Gara / Evento</option>
                  <option value="health">Salute &amp; Benessere</option>
                  <option value="habit">Costanza / Abitudine</option>
                  <option value="strength">Forza / Carico</option>
                </select>
              </label>

              <label className="block text-xs font-semibold text-slate-300">
                Data target (opzionale)
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
          <div className="space-y-4">
            <div>
              <span className="block text-xs font-semibold text-slate-300">
                Seleziona i giorni della settimana in cui puoi allenarti
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => {
                  const active = baseline.availability.days.some((day) => day.day === d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => handleDayToggle(d.id)}
                      className={cn(
                        "rounded-xl px-4 py-2 text-xs font-medium transition",
                        active
                          ? "bg-lime-400 font-bold text-slate-950"
                          : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <span className="block text-xs font-semibold text-slate-300">
                Durata massima per sessione nei giorni selezionati
              </span>
              {baseline.availability.days.map((d) => (
                <div
                  key={d.day}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs"
                >
                  <span className="font-semibold uppercase text-white">{d.day}</span>
                  <label className="flex items-center gap-2">
                    <span className="sr-only">Minuti per {d.day}</span>
                    <input
                      type="number"
                      value={d.maxDurationMin}
                      onChange={(e) => {
                        const val = Number.parseInt(e.target.value, 10) || 45;
                        const nextDays = baseline.availability.days.map((cur) =>
                          cur.day === d.day ? { ...cur, maxDurationMin: val } : cur,
                        );
                        setBaseline({
                          ...baseline,
                          availability: { ...baseline.availability, days: nextDays },
                        });
                      }}
                      className="w-16 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-center text-white"
                    />
                    <span className="text-slate-400">min</span>
                  </label>
                </div>
              ))}
            </div>
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
                <span>Accesso a palestra attrezzata</span>
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
                <span>Accesso a piscina</span>
              </label>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-300">
                Attrezzatura disponibile a casa o personale
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
                      {item.label}
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
              <h3 className="font-bold text-white">Ecco cosa ho capito (Riepilogo Baseline L0):</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>
                  <strong>Atleta:</strong> {baseline.profile.sex}, {baseline.profile.heightCm} cm,{" "}
                  {baseline.profile.weightKg} kg, livello{" "}
                  <strong>{experienceTierLabel(derivedTier)}</strong> (
                  {baseline.profile.capacity.source === "garmin"
                    ? "capacità misurata da Garmin"
                    : baseline.profile.capacity.source === "calibration"
                      ? "settimana 1 di calibrazione"
                      : "capacità inserita a mano"}
                  ).
                </li>
                <li>
                  <strong>Sport:</strong> {baseline.profile.sports.join(", ")}.
                </li>
                <li>
                  <strong>Obiettivo:</strong> {baseline.goals.primary.description}.
                </li>
                <li>
                  <strong>Disponibilità:</strong> {baseline.availability.days.length}{" "}
                  giorni/settimana ({baseline.availability.days.map((d) => d.day).join(", ")}).
                </li>
                <li>
                  <strong>Salute:</strong>{" "}
                  {baseline.anamnesis.injuries.length === 0
                    ? "Nessun infortunio"
                    : baseline.anamnesis.injuries
                        .map((i) => `${i.area} (dolore ${i.painLevel}/10)`)
                        .join(", ")}
                  .
                </li>
              </ul>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-300">
                Orario preferito
                <select
                  value={baseline.preferences.preferredTrainingTime}
                  onChange={(e) =>
                    setBaseline({
                      ...baseline,
                      preferences: {
                        ...baseline.preferences,
                        preferredTrainingTime: e.target.value as PreferredTrainingTime,
                      },
                    })
                  }
                  className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <option value="morning">Mattina</option>
                  <option value="lunch">Pausa pranzo</option>
                  <option value="afternoon">Pomeriggio</option>
                  <option value="evening">Sera</option>
                </select>
              </label>

              <label className="block text-xs font-semibold text-slate-300">
                Tono del coach
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
                  <option value="direct">Diretto ed essenziale</option>
                  <option value="supportive">Incoraggiante ed empatico</option>
                  <option value="analytical">Analitico e scientifico</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-4">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            Indietro
          </button>
        ) : onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-white/10"
          >
            Annulla
          </button>
        ) : (
          <div />
        )}

        {step < 6 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(6, s + 1))}
            className="rounded-xl bg-lime-400 px-5 py-2 text-xs font-bold text-slate-950 transition hover:bg-lime-300"
          >
            Avanti
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-xl bg-lime-400 px-6 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-lime-400/20 transition hover:bg-lime-300 disabled:opacity-50"
          >
            {isSubmitting ? "Salvataggio…" : "Salva Baseline L0"}
          </button>
        )}
      </div>
    </div>
  );
}
