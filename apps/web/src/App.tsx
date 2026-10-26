import {
  type Baseline,
  computeReadiness,
  type FiveKProjection,
  type FiveKProjectionInput,
} from "@health-trainer/domain";
import { cn } from "@health-trainer/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { MorningCheckinCard } from "./components/MorningCheckinCard";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { TrainingPlanBoard } from "./components/TrainingPlanBoard";

type CheckStatus = "ok" | "error" | "configured" | "missing" | "unchecked";
type SyncStatus = "never" | "running" | "ok" | "partial" | "error";

interface HealthReport {
  status: "ok" | "degraded";
  version: string;
  timestamp: string;
  uptimeSec: number;
  checks: {
    mongo: { status: CheckStatus; latencyMs?: number; error?: string };
    garmin: { status: CheckStatus };
    googleAuth: { status: CheckStatus };
    llm: { status: CheckStatus; provider?: string };
  };
}

interface GarminCheck {
  configured: boolean;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

interface GarminActivity {
  id: string;
  date: string;
  sport: string;
  title: string | null;
  durationMin: number;
  distanceKm: number | null;
  avgHr: number | null;
}

interface GarminMetrics {
  date: string;
  restingHr: number | null;
  hrvAvgMs: number | null;
  sleepMinutes: number | null;
  steps: number | null;
  stressAvg: number | null;
  bodyBatteryEnd: number | null;
}

interface GarminOverview {
  configured: boolean;
  lastSync: string | null;
  status: SyncStatus;
  error: string | null;
  counts: { activities: number; metrics: number };
  activities: GarminActivity[];
  metrics: GarminMetrics[];
}

interface GarminSyncResult {
  status: "ok" | "partial";
  from: string;
  to: string;
  days: number;
  activities: number;
  metrics: number;
  errors: string[];
  syncedAt: string;
}

interface YazioCheck {
  configured: boolean;
  ok: boolean;
  latencyMs: number;
  baseUrl?: string;
  error?: string;
}

interface YazioDay {
  date: string;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  waterMl: number | null;
  steps: number | null;
  weightKg: number | null;
  goalKcal: number | null;
}

interface YazioOverview {
  configured: boolean;
  lastSync: string | null;
  status: SyncStatus;
  error: string | null;
  counts: { days: number; weightEntries: number };
  days: YazioDay[];
}

interface YazioSyncResult {
  status: "ok" | "partial";
  from: string;
  to: string;
  days: number;
  nutritionDays: number;
  weightEntries: number;
  errors: string[];
  syncedAt: string;
}

interface ActivityAnalysis {
  externalId: string;
  sport: string;
  date: string;
  summary: {
    durationSec: number;
    distanceM?: number;
    avgHr?: number;
    maxHr?: number;
    avgPaceSecKm?: number;
  };
  derived: {
    negativeSplit?: boolean;
    hrDriftPct?: number;
    paceVariabilityPct?: number;
  };
  brief: string;
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  roles: string[];
}

async function fetchMe(): Promise<UserInfo> {
  const response = await fetch("/api/me");
  if (!response.ok) throw new Error(`Me failed (${response.status})`);
  return response.json() as Promise<UserInfo>;
}

async function fetchHealth(): Promise<HealthReport> {
  const response = await fetch("/api/health");
  if (!response.ok) throw new Error(`Health check failed (${response.status})`);
  return response.json() as Promise<HealthReport>;
}

async function checkGarmin(): Promise<GarminCheck> {
  const response = await fetch("/api/integrations/garmin/check", { method: "POST" });
  const body = (await response.json()) as GarminCheck & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Garmin check failed (${response.status})`);
  return body;
}

async function fetchGarminOverview(): Promise<GarminOverview> {
  const response = await fetch("/api/integrations/garmin/overview?days=7");
  const body = (await response.json()) as GarminOverview & { message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? `Garmin overview failed (${response.status})`);
  }
  return body;
}

async function syncGarmin(): Promise<GarminSyncResult> {
  const response = await fetch("/api/integrations/garmin/sync?days=7", { method: "POST" });
  const body = (await response.json()) as GarminSyncResult & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Garmin sync failed (${response.status})`);
  return body;
}

async function checkYazio(): Promise<YazioCheck> {
  const response = await fetch("/api/integrations/yazio/check", { method: "POST" });
  const body = (await response.json()) as YazioCheck & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Yazio check failed (${response.status})`);
  return body;
}

async function fetchYazioOverview(): Promise<YazioOverview> {
  const response = await fetch("/api/integrations/yazio/overview?days=7");
  const body = (await response.json()) as YazioOverview & { message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? `Yazio overview failed (${response.status})`);
  }
  return body;
}

async function syncYazio(): Promise<YazioSyncResult> {
  const response = await fetch("/api/integrations/yazio/sync?days=7", { method: "POST" });
  const body = (await response.json()) as YazioSyncResult & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Yazio sync failed (${response.status})`);
  return body;
}

async function analyzeGarminActivity(activityId: string): Promise<ActivityAnalysis> {
  const response = await fetch(`/api/integrations/garmin/activities/${activityId}/analyze`, {
    method: "POST",
  });
  const body = (await response.json()) as ActivityAnalysis & { message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? `FIT analysis failed (${response.status})`);
  }
  return body;
}

async function fetchCurrentBaseline(): Promise<Baseline | null> {
  const response = await fetch("/api/baseline");
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Baseline check failed (${response.status})`);
  return response.json() as Promise<Baseline>;
}

async function checkFeasibility(input: FiveKProjectionInput): Promise<FiveKProjection> {
  const response = await fetch("/api/baseline/feasibility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Feasibility check failed");
  return response.json() as Promise<FiveKProjection>;
}

const readiness = computeReadiness({
  hrvToday: 68,
  hrvBaseline: { mean: 62, sd: 6 },
  rhrToday: 51,
  rhrBaseline: { mean: 54, sd: 3 },
  sleepMinutes: 465,
  sleepNeedMinutes: 480,
  subjective: { energy: 4, mood: 4, stress: 2, soreness: 2 },
});

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
  });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatSleep = (minutes: number | null) => {
  if (minutes === null) return "—";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const formatNumber = (value: number | null, suffix = "") =>
  value === null ? "—" : `${value}${suffix}`;

const formatStatus = (status: SyncStatus) =>
  ({
    never: "mai",
    running: "in corso",
    ok: "ok",
    partial: "parziale",
    error: "errore",
  })[status];

function StatusPill({ status }: { status: CheckStatus }) {
  const styles: Record<CheckStatus, string> = {
    ok: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30",
    configured: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30",
    error: "bg-rose-400/10 text-rose-300 ring-rose-400/30",
    missing: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
    unchecked: "bg-slate-400/10 text-slate-300 ring-slate-400/30",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}

function SyncPill({ status }: { status: SyncStatus }) {
  const styles: Record<SyncStatus, string> = {
    never: "bg-slate-400/10 text-slate-300 ring-slate-400/30",
    running: "bg-sky-400/10 text-sky-300 ring-sky-400/30",
    ok: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30",
    partial: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
    error: "bg-rose-400/10 text-rose-300 ring-rose-400/30",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        styles[status],
      )}
    >
      {formatStatus(status)}
    </span>
  );
}

function Card({
  title,
  eyebrow,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/20",
        className,
      )}
    >
      {eyebrow ? (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <div className="mt-4 text-sm text-slate-300">{children}</div>
    </section>
  );
}

export default function App() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth });
  const overview = useQuery({ queryKey: ["garmin-overview"], queryFn: fetchGarminOverview });
  const yazioOverview = useQuery({
    queryKey: ["yazio-overview"],
    queryFn: fetchYazioOverview,
  });
  const garminCheck = useMutation({ mutationFn: checkGarmin });
  const garminSync = useMutation({
    mutationFn: syncGarmin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["garmin-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["health"] });
    },
  });
  const [analyses, setAnalyses] = useState<Record<string, ActivityAnalysis>>({});
  const analyzeActivity = useMutation({
    mutationFn: analyzeGarminActivity,
    onSuccess: (analysis) => {
      setAnalyses((previous) => ({ ...previous, [analysis.externalId]: analysis }));
    },
  });
  const yazioCheck = useMutation({ mutationFn: checkYazio });
  const yazioSync = useMutation({
    mutationFn: syncYazio,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["yazio-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["health"] });
    },
  });

  const [isEditingBaseline, setIsEditingBaseline] = useState(false);
  const [dataFeedback, setDataFeedback] = useState<string | null>(null);

  const wipeDataMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/export/me", { method: "DELETE" });
      if (!res.ok) throw new Error("Errore durante la cancellazione dati");
      return res.json();
    },
    onSuccess: async () => {
      setDataFeedback("Tutti i dati dell'atleta sono stati eliminati con successo dal database.");
      await queryClient.invalidateQueries();
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (jsonString: string) => {
      const backup = JSON.parse(jsonString);
      const res = await fetch("/api/export/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      });
      if (!res.ok) throw new Error("Errore ripristino backup");
      return res.json();
    },
    onSuccess: async () => {
      setDataFeedback("Backup ripristinato con successo!");
      await queryClient.invalidateQueries();
    },
  });

  const baseline = useQuery({
    queryKey: ["baseline"],
    queryFn: fetchCurrentBaseline,
  });
  const feasibilityMutation = useMutation({
    mutationFn: checkFeasibility,
  });

  const apiStatus = health.isError ? "error" : health.data ? "ok" : "unchecked";
  const data = overview.data;
  const yazioData = yazioOverview.data;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-10 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lime-300 font-black text-slate-950">
              HT
            </div>
            <span className="text-sm font-medium tracking-wide text-slate-400">health-trainer</span>
          </div>
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Il loop di coaching,
            <br />
            non un altro tracker.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
            Dati, piano, esecuzione, feedback. Il motore deterministico calcola i vincoli;
            l&apos;LLM progetta e spiega dentro quei vincoli.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {me.data ? (
            <span className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
              Atleta: {me.data.name} ({me.data.email})
            </span>
          ) : null}
          <span className="rounded-full bg-lime-300/10 px-3 py-1.5 text-xs font-semibold text-lime-300 ring-1 ring-inset ring-lime-300/30">
            Fase 1 · Web MVP
          </span>
          <span className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-slate-400 ring-1 ring-inset ring-white/10">
            v0.2.0
          </span>
        </div>
      </header>

      {/* Onboarding & Baseline L0 */}
      <section className="mt-8">
        {baseline.isLoading ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-slate-400">
            Caricamento profilo atleta…
          </div>
        ) : !baseline.data || isEditingBaseline ? (
          <OnboardingWizard
            initialBaseline={baseline.data}
            onSaved={(saved) => {
              queryClient.setQueryData(["baseline"], saved);
              setIsEditingBaseline(false);
            }}
            onCancel={baseline.data ? () => setIsEditingBaseline(false) : undefined}
          />
        ) : (
          <Card
            title={`Profilo Atleta & Baseline (v${baseline.data.version})`}
            eyebrow="Livello 0 · Baseline Attiva"
            className="border-lime-400/20 bg-lime-950/10"
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-lime-400/10 px-3 py-1 text-xs font-semibold text-lime-300 ring-1 ring-inset ring-lime-400/30">
                    {baseline.data.profile.experience}
                  </span>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300 ring-1 ring-inset ring-white/10">
                    {baseline.data.profile.sex} · {baseline.data.profile.heightCm} cm ·{" "}
                    {baseline.data.profile.weightKg} kg
                  </span>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300 ring-1 ring-inset ring-white/10">
                    Valida dal {formatDate(baseline.data.validFrom.slice(0, 10))}
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white">
                    {baseline.data.goals.primary.description}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Tipo:{" "}
                    <span className="capitalize text-white">
                      {baseline.data.goals.primary.type}
                    </span>
                    {baseline.data.goals.primary.targetDate
                      ? ` · Data target: ${baseline.data.goals.primary.targetDate}`
                      : ""}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3 text-xs">
                    <span className="text-slate-400">Sport attivi:</span>
                    <p className="mt-1 font-semibold capitalize text-white">
                      {baseline.data.profile.sports.join(", ")}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3 text-xs">
                    <span className="text-slate-400">Disponibilità:</span>
                    <p className="mt-1 font-semibold text-white">
                      {baseline.data.availability.days.length} gg/settimana (
                      {baseline.data.availability.days.map((d) => d.day.toUpperCase()).join(", ")})
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3 text-xs">
                    <span className="text-slate-400">Anamnesi &amp; Dolori:</span>
                    <p className="mt-1 font-semibold text-white">
                      {baseline.data.anamnesis.injuries.length === 0
                        ? "Nessun infortunio attivo"
                        : baseline.data.anamnesis.injuries
                            .map((i) => `${i.area} (${i.painLevel}/10)`)
                            .join(", ")}
                    </p>
                  </div>
                </div>

                {baseline.data.summary ? (
                  <p className="text-xs italic text-slate-400">
                    &ldquo;{baseline.data.summary}&rdquo;
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingBaseline(true)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10"
                >
                  Modifica Baseline
                </button>
                <button
                  type="button"
                  onClick={() =>
                    feasibilityMutation.mutate({
                      current5kSec: 1800,
                      weeks: 8,
                      experience: baseline.data?.profile.experience ?? "beginner",
                      weeklyVolumeKm: 15,
                    })
                  }
                  disabled={feasibilityMutation.isPending}
                  className="rounded-xl border border-lime-400/30 bg-lime-400/10 px-4 py-2.5 text-xs font-semibold text-lime-300 transition hover:bg-lime-400/20 disabled:opacity-60"
                >
                  {feasibilityMutation.isPending
                    ? "Calcolo Feasibility…"
                    : "Verifica Feasibility 5K"}
                </button>
              </div>
            </div>

            {feasibilityMutation.data ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">Proiezione 5K (Feasibility):</span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 font-bold uppercase",
                      feasibilityMutation.data.confidence === "high"
                        ? "bg-emerald-400/20 text-emerald-300"
                        : feasibilityMutation.data.confidence === "medium"
                          ? "bg-amber-400/20 text-amber-300"
                          : "bg-rose-400/20 text-rose-300",
                    )}
                  >
                    Confidenza: {feasibilityMutation.data.confidence}
                  </span>
                </div>
                <p className="mt-2 text-slate-300">{feasibilityMutation.data.rationale}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-white/5 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">
                      Ottimistico
                    </p>
                    <p className="mt-1 font-mono text-base font-bold text-emerald-400">
                      {Math.floor(feasibilityMutation.data.bestSec / 60)}:
                      {String(Math.floor(feasibilityMutation.data.bestSec % 60)).padStart(2, "0")}
                    </p>
                  </div>
                  <div className="rounded-xl bg-lime-400/10 p-2.5 ring-1 ring-inset ring-lime-400/20">
                    <p className="text-[10px] uppercase tracking-wider text-lime-300">Proiettato</p>
                    <p className="mt-1 font-mono text-base font-bold text-lime-300">
                      {Math.floor(feasibilityMutation.data.projectedSec / 60)}:
                      {String(Math.floor(feasibilityMutation.data.projectedSec % 60)).padStart(
                        2,
                        "0",
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/5 p-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">Prudente</p>
                    <p className="mt-1 font-mono text-base font-bold text-slate-300">
                      {Math.floor(feasibilityMutation.data.worstSec / 60)}:
                      {String(Math.floor(feasibilityMutation.data.worstSec % 60)).padStart(2, "0")}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </Card>
        )}
      </section>

      {/* Check-in Mattutino & Adattamento in Tempo Reale (Task 1.4) */}
      {baseline.data ? (
        <section className="mt-8">
          <MorningCheckinCard />
        </section>
      ) : null}

      {/* Board Settimanale e Sessione Oggi (Task 1.3) */}
      <TrainingPlanBoard hasBaseline={Boolean(baseline.data)} />

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card title="API" eyebrow="Runtime">
          <div className="flex items-center justify-between gap-4">
            <span>Stato del servizio</span>
            <StatusPill status={apiStatus} />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {health.isError
              ? "API non raggiungibile. Avvia `npm run dev:api`."
              : health.data
                ? `Uptime ${health.data.uptimeSec}s · ${new Date(health.data.timestamp).toLocaleTimeString()}`
                : "Verifica in corso…"}
          </p>
        </Card>

        <Card title="MongoDB" eyebrow="Persistenza">
          <div className="flex items-center justify-between gap-4">
            <span>Connessione</span>
            <StatusPill status={health.data?.checks.mongo.status ?? "unchecked"} />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {health.data?.checks.mongo.error ??
              (health.data?.checks.mongo.latencyMs !== undefined
                ? `${health.data.checks.mongo.latencyMs} ms`
                : "MongoDB locale: avvialo e riprova.")}
          </p>
        </Card>

        <Card title="Garmin Personal" eyebrow="Integrazione">
          <div className="flex items-center justify-between gap-4">
            <span>Chiave API</span>
            <StatusPill status={health.data?.checks.garmin.status ?? "unchecked"} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => garminCheck.mutate()}
              disabled={garminCheck.isPending}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {garminCheck.isPending ? "Verifica…" : "Verifica chiave"}
            </button>
            <button
              type="button"
              onClick={() => garminSync.mutate()}
              disabled={garminSync.isPending || overview.isLoading}
              className="rounded-xl bg-lime-300 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {garminSync.isPending ? "Sincronizzo…" : "Sincronizza ora"}
            </button>
          </div>
          {garminCheck.data ? (
            <p
              className={cn(
                "mt-3 text-xs leading-5",
                garminCheck.data.ok ? "text-emerald-300" : "text-rose-300",
              )}
            >
              {garminCheck.data.ok
                ? `OK · ${garminCheck.data.latencyMs} ms`
                : (garminCheck.data.error ?? "Verifica fallita")}
            </p>
          ) : garminCheck.isError ? (
            <p className="mt-3 text-xs leading-5 text-rose-300">{garminCheck.error.message}</p>
          ) : null}
          {garminSync.isSuccess ? (
            <p className="mt-3 text-xs leading-5 text-emerald-300">
              Sync {garminSync.data.status}: {garminSync.data.activities} attività,{" "}
              {garminSync.data.metrics} giorni di metriche.
            </p>
          ) : garminSync.isError ? (
            <p className="mt-3 text-xs leading-5 text-rose-300">{garminSync.error.message}</p>
          ) : null}
        </Card>

        <Card title="Dominio condiviso" eyebrow="Regole" className="lg:col-span-2">
          <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex h-24 w-24 flex-col items-center justify-center rounded-3xl bg-lime-300/10 ring-1 ring-inset ring-lime-300/30">
              <span className="text-3xl font-bold text-lime-300">{readiness.score}</span>
              <span className="text-[10px] uppercase tracking-widest text-lime-200/70">
                readiness
              </span>
            </div>
            <div>
              <p className="text-sm leading-6 text-slate-300">
                Calcolato da <code className="text-lime-300">@health-trainer/domain</code>: HRV,
                RHR, sonno e check-in soggettivo. Confidenza{" "}
                <strong className="text-white">{readiness.confidence}</strong>.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {readiness.flags.length === 0 ? (
                  <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
                    nessun flag
                  </span>
                ) : (
                  readiness.flags.map((flag) => (
                    <span
                      key={flag}
                      className="rounded-full bg-amber-400/10 px-2.5 py-1 text-xs text-amber-300 ring-1 ring-inset ring-amber-400/30"
                    >
                      {flag}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Fase 1 Completata" eyebrow="Stato MVP">
          <ul className="space-y-1.5 text-xs leading-5 text-slate-300">
            <li className="text-lime-300 font-semibold">✓ Baseline L0 &amp; Wizard 6 step</li>
            <li className="text-lime-300 font-semibold">✓ Macro &amp; Micro Plan Multisport</li>
            <li className="text-lime-300 font-semibold">✓ Morning Check-in &amp; Adattamento</li>
            <li className="text-lime-300 font-semibold">✓ Tracciamento &amp; Upload FIT</li>
            <li className="text-lime-300 font-semibold">✓ AI Coach Briefing deterministico</li>
            <li className="text-lime-300 font-semibold">✓ Export FIT &amp; Hevy Pro</li>
            <li className="text-lime-300 font-semibold">✓ Review settimanale &amp; Avanzamento</li>
            <li className="text-lime-300 font-semibold">✓ Backup JSON &amp; Data Sovereignty</li>
          </ul>
        </Card>
      </div>

      <Card title="Dati Garmin" eyebrow="Ultimi 7 giorni" className="mt-4">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <SyncPill status={data?.status ?? "never"} />
            <span>
              {data?.lastSync ? `Ultimo sync: ${formatDateTime(data.lastSync)}` : "Nessun sync"}
            </span>
            <span className="text-slate-600">·</span>
            <span>{data?.counts.activities ?? 0} attività totali</span>
            <span className="text-slate-600">·</span>
            <span>{data?.counts.metrics ?? 0} giorni di metriche</span>
          </div>
          {data?.error ? <span className="text-xs text-rose-300">{data.error}</span> : null}
        </div>

        {overview.isLoading ? (
          <p className="py-6 text-sm text-slate-500">Carico i dati Garmin…</p>
        ) : overview.isError ? (
          <p className="py-6 text-sm text-rose-300">{overview.error.message}</p>
        ) : !data || data.counts.activities === 0 ? (
          <p className="py-6 text-sm text-slate-500">
            Nessun dato ancora. Premi <strong className="text-white">Sincronizza ora</strong>.
          </p>
        ) : (
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Attività recenti
              </h3>
              <ul className="space-y-2">
                {data.activities.map((activity) => {
                  const analysis = analyses[activity.id];
                  return (
                    <li
                      key={activity.id}
                      className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">
                            {activity.title ?? activity.sport}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatDate(activity.date)} · {activity.sport}
                          </p>
                        </div>
                        <div className="text-right text-xs text-slate-400">
                          <p>{activity.durationMin} min</p>
                          <p>
                            {activity.distanceKm !== null
                              ? `${activity.distanceKm.toFixed(2)} km`
                              : "—"}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => analyzeActivity.mutate(activity.id)}
                        disabled={analyzeActivity.isPending}
                        className="mt-3 rounded-lg border border-lime-300/30 bg-lime-300/10 px-2.5 py-1.5 text-[11px] font-semibold text-lime-300 transition hover:bg-lime-300/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {analyzeActivity.isPending && analyzeActivity.variables === activity.id
                          ? "Analizzo FIT…"
                          : "Analizza FIT"}
                      </button>

                      {analysis ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[11px] font-semibold text-slate-400">
                            Brief pronto per l&apos;LLM
                          </summary>
                          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-[11px] leading-5 text-slate-300">
                            {analysis.brief}
                          </pre>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
                {analyzeActivity.isError ? (
                  <li className="text-xs text-rose-300">{analyzeActivity.error.message}</li>
                ) : null}
              </ul>
            </div>

            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Metriche giornaliere
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="pb-2 pr-3 font-medium">Giorno</th>
                      <th className="pb-2 pr-3 font-medium">RHR</th>
                      <th className="pb-2 pr-3 font-medium">HRV</th>
                      <th className="pb-2 pr-3 font-medium">Sonno</th>
                      <th className="pb-2 pr-3 font-medium">Passi</th>
                      <th className="pb-2 pr-3 font-medium">Stress</th>
                      <th className="pb-2 font-medium">Battery</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {data.metrics.map((metric) => (
                      <tr key={metric.date} className="border-t border-white/5">
                        <td className="py-2 pr-3 whitespace-nowrap">{formatDate(metric.date)}</td>
                        <td className="py-2 pr-3">{formatNumber(metric.restingHr)}</td>
                        <td className="py-2 pr-3">{formatNumber(metric.hrvAvgMs, " ms")}</td>
                        <td className="py-2 pr-3">{formatSleep(metric.sleepMinutes)}</td>
                        <td className="py-2 pr-3">
                          {metric.steps !== null ? metric.steps.toLocaleString("it-IT") : "—"}
                        </td>
                        <td className="py-2 pr-3">{formatNumber(metric.stressAvg)}</td>
                        <td className="py-2">{formatNumber(metric.bodyBatteryEnd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card title="Nutrizione Yazio" eyebrow="Ultimi 7 giorni" className="mt-4">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <SyncPill status={yazioData?.status ?? "never"} />
            <span>
              {yazioData?.lastSync
                ? `Ultimo sync: ${formatDateTime(yazioData.lastSync)}`
                : "Nessun sync"}
            </span>
            <span className="text-slate-600">·</span>
            <span>{yazioData?.counts.days ?? 0} giorni</span>
            <span className="text-slate-600">·</span>
            <span>{yazioData?.counts.weightEntries ?? 0} pesi</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => yazioCheck.mutate()}
              disabled={yazioCheck.isPending}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {yazioCheck.isPending ? "Verifica…" : "Verifica Yazio"}
            </button>
            <button
              type="button"
              onClick={() => yazioSync.mutate()}
              disabled={yazioSync.isPending}
              className="rounded-xl bg-lime-300 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {yazioSync.isPending ? "Sincronizzo…" : "Sincronizza Yazio"}
            </button>
          </div>
        </div>

        {yazioData?.error ? <p className="mt-3 text-xs text-rose-300">{yazioData.error}</p> : null}
        {yazioCheck.data ? (
          <p
            className={cn(
              "mt-3 text-xs",
              yazioCheck.data.ok ? "text-emerald-300" : "text-rose-300",
            )}
          >
            {yazioCheck.data.ok
              ? `OK · ${yazioCheck.data.latencyMs} ms · ${yazioCheck.data.baseUrl ?? ""}`
              : (yazioCheck.data.error ?? "Verifica fallita")}
          </p>
        ) : yazioCheck.isError ? (
          <p className="mt-3 text-xs text-rose-300">{yazioCheck.error.message}</p>
        ) : null}
        {yazioSync.isSuccess ? (
          <p className="mt-3 text-xs text-emerald-300">
            Sync {yazioSync.data.status}: {yazioSync.data.nutritionDays} giorni,{" "}
            {yazioSync.data.weightEntries} pesi.
          </p>
        ) : yazioSync.isError ? (
          <p className="mt-3 text-xs text-rose-300">{yazioSync.error.message}</p>
        ) : null}

        {yazioOverview.isLoading ? (
          <p className="py-6 text-sm text-slate-500">Carico i dati Yazio…</p>
        ) : yazioOverview.isError ? (
          <p className="py-6 text-sm text-rose-300">{yazioOverview.error.message}</p>
        ) : !yazioData || yazioData.days.length === 0 ? (
          <div className="py-6 text-sm text-slate-500">
            {yazioData?.configured === false ? (
              <p>
                Yazio non configurato. Aggiungi le credenziali in{" "}
                <code className="text-slate-300">secrets/yazio.json</code> e riavvia l&apos;API.
              </p>
            ) : (
              <p>
                Nessun dato. Premi <strong className="text-white">Sincronizza Yazio</strong>.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-2 pr-3 font-medium">Giorno</th>
                  <th className="pb-2 pr-3 font-medium">Kcal</th>
                  <th className="pb-2 pr-3 font-medium">Proteine</th>
                  <th className="pb-2 pr-3 font-medium">Carbo</th>
                  <th className="pb-2 pr-3 font-medium">Grassi</th>
                  <th className="pb-2 pr-3 font-medium">Acqua</th>
                  <th className="pb-2 pr-3 font-medium">Peso</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {yazioData.days.map((day) => (
                  <tr key={day.date} className="border-t border-white/5">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDate(day.date)}</td>
                    <td className="py-2 pr-3">
                      {formatNumber(day.kcal)}
                      {day.goalKcal !== null ? (
                        <span className="text-slate-600"> / {day.goalKcal}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{formatNumber(day.proteinG, " g")}</td>
                    <td className="py-2 pr-3">{formatNumber(day.carbsG, " g")}</td>
                    <td className="py-2 pr-3">{formatNumber(day.fatG, " g")}</td>
                    <td className="py-2 pr-3">
                      {day.waterMl !== null ? `${(day.waterMl / 1000).toFixed(1)} L` : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {day.weightKg !== null ? `${day.weightKg.toFixed(1)} kg` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Export Workout Garmin (.FIT)" eyebrow="Export manuale" className="mt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-white">5×800m Ripetute Corsa</h3>
            <p className="mt-1 text-xs text-slate-400">
              Riscaldamento 10 min (Zona 2) · 5× [800m @ 4:15–4:35/km + 200m recupero] ·
              Defaticamento 10 min (Zona 1).
            </p>
          </div>
          <a
            href="/api/export/workouts/sample-5x800m.fit"
            download="5x800m-intervals.fit"
            className="inline-flex items-center justify-center rounded-xl bg-lime-300 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-lime-200"
          >
            Scarica workout (.FIT)
          </a>
        </div>
        <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs text-slate-400">
          <p className="font-medium text-slate-300">Come importare in Garmin Connect:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>
              Apri{" "}
              <a
                href="https://connect.garmin.com/modern/workouts"
                target="_blank"
                rel="noreferrer"
                className="text-lime-300 underline"
              >
                Garmin Connect Workouts
              </a>{" "}
              su computer.
            </li>
            <li>
              Clicca su <strong>Importa</strong> accanto a &quot;Crea un allenamento&quot;.
            </li>
            <li>
              Trascina o seleziona il file{" "}
              <code className="text-slate-200">5x800m-intervals.fit</code> scaricato.
            </li>
            <li>
              In alternativa, collega l&apos;orologio via USB e copia il file nella cartella{" "}
              <code className="text-slate-200">GARMIN/NewFiles/</code>.
            </li>
          </ol>
        </div>
      </Card>

      <Card
        title="Sovranità dei Dati &amp; Backup (GDPR)"
        eyebrow="Privacy &amp; Portabilità"
        className="mt-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-white">I tuoi dati appartengono a te</h3>
            <p className="mt-1 text-xs text-slate-400">
              Esporta l&apos;intero storico in formato standard JSON aperto, ripristinalo su un
              altro ambiente o elimina ogni traccia dal server.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/export/backup"
              download
              className="inline-flex items-center justify-center rounded-xl bg-lime-300 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-lime-200"
            >
              Scarica Backup (.JSON)
            </a>
            <label className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10">
              Ripristina Backup
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === "string") {
                      restoreBackupMutation.mutate(reader.result);
                    }
                  };
                  reader.readAsText(file);
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "Sei sicuro di voler eliminare TUTTI i tuoi dati di allenamento, baseline e check-in? L'operazione è irreversibile.",
                  )
                ) {
                  wipeDataMutation.mutate();
                }
              }}
              disabled={wipeDataMutation.isPending}
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
            >
              {wipeDataMutation.isPending ? "Eliminazione…" : "Elimina tutti i miei dati"}
            </button>
          </div>
        </div>

        {dataFeedback && (
          <div className="mt-3 rounded-xl bg-white/5 p-3 text-xs text-lime-300 ring-1 ring-lime-400/20">
            {dataFeedback}
          </div>
        )}
      </Card>

      <footer className="mt-auto flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>health-trainer · documentazione in `docs/`</span>
        <span>Strava escluso · dati salute local-first su Android</span>
      </footer>
    </main>
  );
}
