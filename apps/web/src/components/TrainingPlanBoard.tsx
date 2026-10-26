import type { MacroPlan, MicroPlan, PlannedSession, Sport } from "@health-trainer/domain";
import { cn } from "@health-trainer/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

interface TrainingPlanBoardProps {
  hasBaseline: boolean;
}

interface TodaySessionResponse {
  today: string;
  session: PlannedSession | null;
  alternatives: { label: string; changes: string }[];
  microPlanId?: string;
  isRestDay: boolean;
}

const SPORT_COLORS: Record<Sport, { bg: string; text: string; ring: string }> = {
  running: { bg: "bg-sky-400/10", text: "text-sky-300", ring: "ring-sky-400/30" },
  cycling: { bg: "bg-amber-400/10", text: "text-amber-300", ring: "ring-amber-400/30" },
  swimming: { bg: "bg-teal-400/10", text: "text-teal-300", ring: "ring-teal-400/30" },
  strength: { bg: "bg-purple-400/10", text: "text-purple-300", ring: "ring-purple-400/30" },
  mobility: { bg: "bg-emerald-400/10", text: "text-emerald-300", ring: "ring-emerald-400/30" },
  other: { bg: "bg-slate-400/10", text: "text-slate-300", ring: "ring-slate-400/30" },
};

async function fetchMacroPlan(): Promise<MacroPlan | null> {
  const res = await fetch("/api/plan/macro");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Errore caricamento macro-piano");
  return res.json() as Promise<MacroPlan>;
}

async function fetchMicroPlan(): Promise<MicroPlan | null> {
  const res = await fetch("/api/plan/micro");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Errore caricamento micro-piano");
  return res.json() as Promise<MicroPlan>;
}

async function fetchTodaySession(): Promise<TodaySessionResponse> {
  const res = await fetch("/api/plan/today");
  if (!res.ok) throw new Error("Errore caricamento sessione odierna");
  return res.json() as Promise<TodaySessionResponse>;
}

async function generatePlan(): Promise<{ macroPlan: MacroPlan; microPlan: MicroPlan }> {
  const res = await fetch("/api/plan/macro/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? "Errore generazione piano");
  }
  return res.json() as Promise<{ macroPlan: MacroPlan; microPlan: MicroPlan }>;
}

async function updateSessionStatus(args: {
  sessionId: string;
  status: "planned" | "completed" | "skipped" | "adjusted";
  notes?: string;
}): Promise<void> {
  const res = await fetch(`/api/plan/sessions/${args.sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: args.status, notes: args.notes }),
  });
  if (!res.ok) throw new Error("Errore aggiornamento sessione");
}

export function TrainingPlanBoard({ hasBaseline }: TrainingPlanBoardProps) {
  const queryClient = useQueryClient();
  const [selectedAlternative, setSelectedAlternative] = useState<string | null>(null);

  const macro = useQuery({ queryKey: ["macro-plan"], queryFn: fetchMacroPlan });
  const micro = useQuery({ queryKey: ["micro-plan"], queryFn: fetchMicroPlan });
  const today = useQuery({ queryKey: ["today-session"], queryFn: fetchTodaySession });

  const generateMutation = useMutation({
    mutationFn: generatePlan,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["macro-plan"] });
      await queryClient.invalidateQueries({ queryKey: ["micro-plan"] });
      await queryClient.invalidateQueries({ queryKey: ["today-session"] });
    },
  });

  const updateSessionMutation = useMutation({
    mutationFn: updateSessionStatus,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["micro-plan"] });
      await queryClient.invalidateQueries({ queryKey: ["today-session"] });
    },
  });

  if (!hasBaseline) {
    return null;
  }

  const hasPlan = Boolean(macro.data && micro.data);

  return (
    <div className="mt-8 space-y-6">
      {/* Plan Header & Generator */}
      <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lime-400">
            Livello 1–3 · Piano &amp; Coaching Loop
          </span>
          <h2 className="mt-1 text-2xl font-bold text-white">
            {macro.data ? macro.data.goalDescription : "Piano di Allenamento"}
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {macro.data
              ? `${macro.data.totalWeeks} settimane totali · Fasi strutturate · Board multisport`
              : "Genera il macrociclo e il microciclo settimanale basandoti sui vincoli della tua baseline."}
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="rounded-xl bg-lime-400 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-lime-400/20 transition hover:bg-lime-300 disabled:opacity-50"
          >
            {generateMutation.isPending
              ? "Generazione in corso…"
              : hasPlan
                ? "Rigenera Piano"
                : "Genera Piano Deterministico"}
          </button>
        </div>
      </div>

      {generateMutation.isError ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
          {generateMutation.error.message}
        </div>
      ) : null}

      {hasPlan && (
        <>
          {/* Card "OGGI" */}
          <div className="rounded-3xl border border-lime-400/30 bg-lime-950/20 p-6 shadow-2xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-lime-400">
                  Focus di Oggi · {today.data?.today ?? ""}
                </span>
                <h3 className="mt-1 text-xl font-bold text-white">
                  {today.data?.session
                    ? today.data.session.title
                    : "Giornata di Riposo Attivo o Recupero"}
                </h3>
              </div>

              {today.data?.session ? (
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
                      SPORT_COLORS[today.data.session.sport].bg,
                      SPORT_COLORS[today.data.session.sport].text,
                      SPORT_COLORS[today.data.session.sport].ring,
                    )}
                  >
                    {today.data.session.sport.toUpperCase()}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
                      today.data.session.status === "completed"
                        ? "bg-emerald-400/20 text-emerald-300 ring-emerald-400/30"
                        : "bg-white/10 text-slate-300 ring-white/10",
                    )}
                  >
                    {today.data.session.status === "completed" ? "Completata" : "Pianificata"}
                  </span>
                </div>
              ) : null}
            </div>

            {today.data?.session ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                  <span>
                    Durata:{" "}
                    <strong className="text-white">{today.data.session.durationMin} min</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Intensità:{" "}
                    <strong className="text-white">
                      RPE {today.data.session.intensity.rpe}/10 (
                      {today.data.session.intensity.target})
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    Luogo:{" "}
                    <strong className="capitalize text-white">{today.data.session.location}</strong>
                  </span>
                </div>

                {/* Structured Blocks */}
                <div className="rounded-2xl border border-white/5 bg-black/30 p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Struttura della sessione
                  </span>
                  <div className="mt-3 space-y-2">
                    {today.data.session.blocks.map((block, bIdx) => {
                      const blockKey = `block-${bIdx}-${block.repeat}-${block.steps.length}`;
                      return (
                        <div key={blockKey} className="space-y-1.5">
                          {block.repeat > 1 && (
                            <p className="text-xs font-bold text-lime-400">
                              Ripeti {block.repeat} volte:
                            </p>
                          )}
                          {block.steps.map((step, sIdx) => {
                            const stepKey = `step-${bIdx}-${sIdx}-${step.kind}-${step.durationMin ?? step.distanceM ?? ""}`;
                            return (
                              <div
                                key={stepKey}
                                className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3 py-2 text-xs"
                              >
                                <span className="font-semibold capitalize text-white">
                                  {step.kind === "warmup" && "Riscaldamento"}
                                  {step.kind === "work" && "Lavoro principale"}
                                  {step.kind === "recovery" && "Recupero"}
                                  {step.kind === "cooldown" && "Defaticamento"}
                                  {step.kind === "mobility" && "Mobilità"}
                                </span>
                                <span className="text-slate-300">
                                  {step.durationMin ? `${step.durationMin} min` : ""}
                                  {step.distanceM ? `${step.distanceM}m` : ""}
                                  {step.target ? ` · ${step.target}` : ""}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Alternatives */}
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs">
                  <span className="font-semibold text-slate-300">
                    Poco tempo o affaticamento? Alternative disponibili:
                  </span>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {today.data.session.alternatives.map((alt) => (
                      <button
                        type="button"
                        key={alt.label}
                        onClick={() => setSelectedAlternative(alt.label)}
                        className={cn(
                          "cursor-pointer rounded-xl border p-3 text-left transition",
                          selectedAlternative === alt.label
                            ? "border-lime-400 bg-lime-400/10 text-white"
                            : "border-white/5 bg-black/20 text-slate-300 hover:border-white/10",
                        )}
                      >
                        <strong className="block text-white">{alt.label}</strong>
                        <p className="mt-1 text-[11px] leading-4 text-slate-400">{alt.changes}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Session Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <p className="text-xs text-slate-400">
                    Criterio di successo:{" "}
                    <span className="text-slate-200">{today.data.session.successCriteria}</span>
                  </p>

                  <div className="flex items-center gap-2">
                    {today.data.session.status !== "completed" ? (
                      <button
                        type="button"
                        onClick={() => {
                          const currentSession = today.data?.session;
                          if (!currentSession) return;
                          updateSessionMutation.mutate({
                            sessionId: currentSession.id,
                            status: "completed",
                            notes: selectedAlternative
                              ? `Eseguita con variante: ${selectedAlternative}`
                              : undefined,
                          });
                        }}
                        disabled={updateSessionMutation.isPending}
                        className="rounded-xl bg-lime-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-md transition hover:bg-lime-300 disabled:opacity-50"
                      >
                        {updateSessionMutation.isPending ? "Salvataggio…" : "Segna come completata"}
                      </button>
                    ) : (
                      <span className="rounded-xl bg-emerald-400/20 px-4 py-2 text-xs font-bold text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
                        Sessione registrata con successo
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-slate-400">
                Oggi nessun allenamento ad alto carico in programma. Dedica 15 minuti a mobilità,
                passeggiata leggera o recupero attivo.
              </p>
            )}
          </div>

          {/* Board Settimanale Multisport */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Microciclo · Settimana {micro.data?.weekIndex}
                </span>
                <h3 className="mt-0.5 text-lg font-bold text-white">
                  Board Settimanale Multisport
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Volume: {micro.data?.weeklyVolumeMin} min</span>
                {micro.data?.deload ? (
                  <span className="rounded-full bg-amber-400/10 px-2.5 py-0.5 text-amber-300 ring-1 ring-inset ring-amber-400/30">
                    Settimana di scarico
                  </span>
                ) : null}
              </div>
            </div>

            <p className="mt-2 text-xs text-slate-300">{micro.data?.focus}</p>

            {/* Grid of days */}
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {micro.data?.sessions.map((sess) => {
                const colors = SPORT_COLORS[sess.sport];
                const isCompleted = sess.status === "completed";
                const isToday = sess.date === today.data?.today;

                return (
                  <div
                    key={sess.id}
                    className={cn(
                      "flex flex-col justify-between rounded-2xl border p-4 transition",
                      isToday
                        ? "border-lime-400/40 bg-lime-400/5 ring-1 ring-lime-400/20"
                        : "border-white/5 bg-black/20 hover:border-white/10",
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset",
                            colors.bg,
                            colors.text,
                            colors.ring,
                          )}
                        >
                          {sess.sport}
                        </span>
                        <span className="text-[11px] font-medium text-slate-400">{sess.date}</span>
                      </div>

                      <h4 className="mt-3 text-sm font-bold text-white">{sess.title}</h4>
                      <p className="mt-1 text-xs text-slate-400">
                        {sess.durationMin} min · RPE {sess.intensity.rpe}/10 (
                        {sess.intensity.target})
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-[11px]">
                      <span className="capitalize text-slate-400">{sess.location}</span>
                      <span
                        className={cn(
                          "font-semibold",
                          isCompleted ? "text-emerald-300" : "text-slate-400",
                        )}
                      >
                        {isCompleted ? "Completata" : "In programma"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Macrociclo Timeline */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Macrociclo · Progressione delle Fasi
            </span>
            <h3 className="mt-1 text-lg font-bold text-white">Timeline del Piano (Fasi L1)</h3>
            <p className="mt-1 text-xs text-slate-400">{macro.data?.rationale}</p>

            <div className="mt-6 space-y-3">
              {macro.data?.phases.map((phase, idx) => {
                const currentWeek = micro.data?.weekIndex ?? 1;
                const isCurrent = currentWeek >= phase.startWeek && currentWeek <= phase.endWeek;

                return (
                  <div
                    key={phase.name}
                    className={cn(
                      "flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between",
                      isCurrent
                        ? "border-lime-400/30 bg-lime-400/5 ring-1 ring-lime-400/20"
                        : "border-white/5 bg-black/10",
                    )}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold text-white">
                          Fase {idx + 1}
                        </span>
                        <strong className="text-sm text-white">{phase.name}</strong>
                        {isCurrent && (
                          <span className="rounded-full bg-lime-400/20 px-2 py-0.5 text-[10px] font-bold uppercase text-lime-300">
                            Fase Attuale
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-300">{phase.focus}</p>
                    </div>

                    <div className="text-right text-xs text-slate-400 whitespace-nowrap">
                      <span>
                        Settimane {phase.startWeek}–{phase.endWeek}
                      </span>
                      {phase.weeklyVolumeMin ? (
                        <p className="text-slate-500">~{phase.weeklyVolumeMin} min/settimana</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
