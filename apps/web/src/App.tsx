import {
  type Baseline,
  computeReadiness,
  experienceTierLabel,
  type FiveKFeasibility,
  type MethodologyDecision,
  type MethodologyEnvelope,
  type MethodologyValidation,
} from "@health-trainer/domain";
import { cn } from "@health-trainer/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { DownloadButton } from "./components/DownloadButton";
import { GarminImportPanel } from "./components/GarminImportPanel";
import { GoogleSignInButton } from "./components/GoogleSignInButton";
import { MorningCheckinCard } from "./components/MorningCheckinCard";
import { OnboardingWizard, type ProfileFocus } from "./components/OnboardingWizard";
import { PlanInterviewChat } from "./components/PlanInterviewChat";
import { fetchMacroPlan, TrainingPlanBoard } from "./components/TrainingPlanBoard";
import { LanguageSelector, useI18n } from "./i18n";
import {
  apiFetch,
  fetchAuthStatus,
  fetchMe,
  loginDev,
  loginLocal,
  loginWithGoogle,
  logout,
  registerLocal,
  type SessionUser,
} from "./lib/api";

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

async function fetchHealth(): Promise<HealthReport> {
  const response = await apiFetch("/api/health");
  if (!response.ok) throw new Error(`Health check failed (${response.status})`);
  return response.json() as Promise<HealthReport>;
}

async function checkGarmin(): Promise<GarminCheck> {
  const response = await apiFetch("/api/integrations/garmin/check", { method: "POST" });
  const body = (await response.json()) as GarminCheck & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Garmin check failed (${response.status})`);
  return body;
}

async function fetchGarminOverview(): Promise<GarminOverview> {
  const response = await apiFetch("/api/integrations/garmin/overview?days=7");
  const body = (await response.json()) as GarminOverview & { message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? `Garmin overview failed (${response.status})`);
  }
  return body;
}

async function syncGarmin(): Promise<GarminSyncResult> {
  const response = await apiFetch("/api/integrations/garmin/sync?days=7", { method: "POST" });
  const body = (await response.json()) as GarminSyncResult & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Garmin sync failed (${response.status})`);
  return body;
}

async function checkYazio(): Promise<YazioCheck> {
  const response = await apiFetch("/api/integrations/yazio/check", { method: "POST" });
  const body = (await response.json()) as YazioCheck & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Yazio check failed (${response.status})`);
  return body;
}

async function fetchYazioOverview(): Promise<YazioOverview> {
  const response = await apiFetch("/api/integrations/yazio/overview?days=7");
  const body = (await response.json()) as YazioOverview & { message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? `Yazio overview failed (${response.status})`);
  }
  return body;
}

async function syncYazio(): Promise<YazioSyncResult> {
  const response = await apiFetch("/api/integrations/yazio/sync?days=7", { method: "POST" });
  const body = (await response.json()) as YazioSyncResult & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Yazio sync failed (${response.status})`);
  return body;
}

async function analyzeGarminActivity(activityId: string): Promise<ActivityAnalysis> {
  const response = await apiFetch(`/api/integrations/garmin/activities/${activityId}/analyze`, {
    method: "POST",
  });
  const body = (await response.json()) as ActivityAnalysis & { message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? `FIT analysis failed (${response.status})`);
  }
  return body;
}

async function fetchCurrentBaseline(): Promise<Baseline | null> {
  const response = await apiFetch("/api/baseline");
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Baseline check failed (${response.status})`);
  return response.json() as Promise<Baseline>;
}

async function checkFeasibility(): Promise<FiveKFeasibility> {
  const response = await apiFetch("/api/baseline/feasibility", { method: "POST" });
  const body = (await response.json()) as FiveKFeasibility & { message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? `Feasibility check failed (${response.status})`);
  }
  return body;
}

interface MethodologyEvaluation {
  id: string;
  createdAt: string;
  promptVersion: string;
  provider: string;
  model: string;
  goalDescription: string;
  envelope: MethodologyEnvelope;
  decision: MethodologyDecision;
  validation: MethodologyValidation;
}

async function fetchLatestMethodology(): Promise<MethodologyEvaluation | null> {
  const response = await apiFetch("/api/plan/methodology/latest");
  if (!response.ok) return null;
  const body = (await response.json()) as { evaluation: MethodologyEvaluation | null };
  return body.evaluation;
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

const formatSleep = (minutes: number | null) => {
  if (minutes === null) return "—";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const formatNumber = (value: number | null, suffix = "") =>
  value === null ? "—" : `${value}${suffix}`;

const formatStatus = (status: SyncStatus, locale: string) =>
  locale === "it"
    ? {
        never: "mai",
        running: "in corso",
        ok: "ok",
        partial: "parziale",
        error: "errore",
      }[status]
    : {
        never: "never",
        running: "running",
        ok: "ok",
        partial: "partial",
        error: "error",
      }[status];

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

function SyncPill({ status, locale = "en" }: { status: SyncStatus; locale?: string }) {
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
      {formatStatus(status, locale)}
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

function FeasibilityResult({ result }: { result: FiveKFeasibility }) {
  const { t } = useI18n();
  const warningLabels: Record<string, string> = {
    no_5k_reference: t.baseline.feasibilityWarnings.missing_recent_effort,
    no_running_volume: t.baseline.feasibilityWarnings.insufficient_recent_volume,
    target_date_passed: t.baseline.feasibilityWarnings.target_date_passed,
    no_target_date: t.baseline.noTargetDate,
    long_horizon: t.baseline.longHorizon,
    plan_not_started: t.baseline.planNotStarted,
    insufficient_completed_sessions: t.baseline.insufficientData,
  };
  const warnings = result.warnings;
  const formatTime = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

  if (!result.available || !result.projection) {
    return (
      <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-xs">
        <p className="font-bold text-amber-200">{t.baseline.feasibilityUnavailable}</p>
        <p className="mt-1 text-slate-300">
          {warnings.includes("plan_not_started")
            ? t.baseline.planNotStarted
            : warnings.includes("insufficient_completed_sessions")
              ? t.baseline.waitingForSessions(result.sessionsRequired, result.sessionsCompleted)
              : t.baseline.insufficientData}
        </p>
        {warnings.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-300">
            {warnings.map((warning) => (
              <li key={warning}>{warningLabels[warning] ?? warning}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  const { projection } = result;
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-white">{t.baseline.feasibilityTitle}</span>
        <span className="rounded-full bg-white/5 px-2.5 py-0.5 font-bold uppercase text-slate-300">
          {t.baseline.confidence}: {t.baseline.confidenceLabel[projection.confidence]}
        </span>
      </div>
      <p className="mt-2 text-slate-300">{projection.rationale}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white/5 p-2.5">
          <p className="text-[10px] uppercase text-slate-400">{t.baseline.optimistic}</p>
          <p className="font-mono text-base font-bold text-emerald-400">
            {formatTime(projection.bestSec)}
          </p>
        </div>
        <div className="rounded-xl bg-lime-400/10 p-2.5">
          <p className="text-[10px] uppercase text-lime-300">{t.baseline.projected}</p>
          <p className="font-mono text-base font-bold text-lime-300">
            {formatTime(projection.projectedSec)}
          </p>
        </div>
        <div className="rounded-xl bg-white/5 p-2.5">
          <p className="text-[10px] uppercase text-slate-400">{t.baseline.conservative}</p>
          <p className="font-mono text-base font-bold text-slate-300">
            {formatTime(projection.worstSec)}
          </p>
        </div>
      </div>
    </div>
  );
}

function MethodologyResult({ evaluation }: { evaluation: MethodologyEvaluation }) {
  const { t } = useI18n();
  const { decision, envelope } = evaluation;
  const structure = decision.weeklyStructure;

  return (
    <div className="mt-4 rounded-2xl border border-sky-400/20 bg-sky-400/[0.04] p-4 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">
            {t.baseline.methodologyTitle}
          </p>
          <p className="text-sm font-bold text-white">{decision.methodology}</p>
        </div>
        <span className="rounded-full bg-sky-400/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-sky-200">
          {t.baseline.confidence}: {t.baseline.confidenceLabel[decision.confidence]}
        </span>
      </div>

      <p className="mt-2 text-slate-300">{decision.why}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-white/5 p-2.5">
          <p className="text-[10px] uppercase text-slate-400">{t.baseline.sessionsCount}</p>
          <p className="mt-1 font-mono text-base font-bold text-white">{structure.sessions}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-2.5">
          <p className="text-[10px] uppercase text-slate-400">{t.baseline.qualitySessions}</p>
          <p className="mt-1 font-mono text-base font-bold text-white">
            {structure.qualitySessions}
          </p>
        </div>
        <div className="rounded-xl bg-white/5 p-2.5">
          <p className="text-[10px] uppercase text-slate-400">{t.baseline.longRunMin}</p>
          <p className="mt-1 font-mono text-base font-bold text-white">
            {structure.longSessionMin}′
          </p>
        </div>
        <div className="rounded-xl bg-white/5 p-2.5">
          <p className="text-[10px] uppercase text-slate-400">{t.baseline.strengthSessions}</p>
          <p className="mt-1 font-mono text-base font-bold text-white">
            {structure.strengthSessions}
          </p>
        </div>
      </div>

      <dl className="mt-3 space-y-1.5 rounded-xl bg-white/[0.03] p-3 text-[11px] text-slate-300">
        <div>
          <dt className="text-slate-400">{t.baseline.periodization}</dt>
          <dd>
            {decision.periodization
              ? `${decision.periodization.model}: ${decision.periodization.loadWeeks} / ${decision.periodization.deloadWeeks} · taper ${decision.periodization.taperWeeks}`
              : t.baseline.notSpecified}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">{t.baseline.phases}</dt>
          <dd>
            {decision.phases
              ? decision.phases
                  .map((phase) => `${phase.name} (${phase.startWeek}-${phase.endWeek})`)
                  .join(" · ")
              : t.baseline.notSpecified}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">{t.baseline.evidence}</dt>
          <dd>{decision.evidence.join(" · ")}</dd>
        </div>
        <div>
          <dt className="text-slate-400">{t.baseline.rejectedAlternatives}</dt>
          <dd>{decision.alternatives.map((item) => `${item.name}: ${item.whyNot}`).join(" · ")}</dd>
        </div>
        <div>
          <dt className="text-slate-400">{t.baseline.verifiedLimits}</dt>
          <dd>
            {envelope.reasons.join(" · ")} · {t.baseline.horizon}{" "}
            {envelope.horizonWeeks ? t.baseline.horizonWeeks(envelope.horizonWeeks) : "n/d"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Dashboard({ user }: { user: SessionUser }) {
  const { t, locale, formatDate, formatDateTime } = useI18n();
  const queryClient = useQueryClient();
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
  const [baselineEditStep, setBaselineEditStep] = useState(1);
  const [baselineEditFocus, setBaselineEditFocus] = useState<ProfileFocus>("full");
  const [isInterviewOpen, setIsInterviewOpen] = useState(false);
  const [dataFeedback, setDataFeedback] = useState<string | null>(null);

  const openBaselineEditor = (step: number, focus: ProfileFocus) => {
    setBaselineEditStep(step);
    setBaselineEditFocus(focus);
    setIsEditingBaseline(true);
  };

  const wipeDataMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/export/me", { method: "DELETE" });
      if (!res.ok) throw new Error(t.system.deleteError);
      return res.json();
    },
    onSuccess: async () => {
      setDataFeedback(t.system.deleteSuccess);
      await queryClient.invalidateQueries();
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (jsonString: string) => {
      const backup = JSON.parse(jsonString);
      const res = await apiFetch("/api/export/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      });
      if (!res.ok) throw new Error(t.system.restoreError);
      return res.json();
    },
    onSuccess: async () => {
      setDataFeedback(t.system.restoreSuccess);
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
  const methodology = useQuery({
    queryKey: ["methodology"],
    queryFn: fetchLatestMethodology,
  });
  const macroPlan = useQuery({ queryKey: ["macro-plan"], queryFn: fetchMacroPlan });
  const hasPlan = Boolean(macroPlan.data);

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
            {locale === "it" ? (
              <>
                Il loop di coaching,
                <br />
                non un altro tracker.
              </>
            ) : (
              <>
                The coaching loop,
                <br />
                not another tracker.
              </>
            )}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">{t.header.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LanguageSelector />
          {user ? (
            <span className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
              {t.ui.athlete} {user.name} ({user.email})
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              logout();
              queryClient.clear();
              window.location.reload();
            }}
            className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-inset ring-white/10 transition hover:bg-white/10 hover:text-white"
          >
            {t.auth.signOut}
          </button>
          <span className="rounded-full bg-lime-300/10 px-3 py-1.5 text-xs font-semibold text-lime-300 ring-1 ring-inset ring-lime-300/30">
            {t.header.phaseTag}
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
            {t.ui.loadingAthleteProfile}
          </div>
        ) : !baseline.data || isEditingBaseline ? (
          <OnboardingWizard
            initialBaseline={baseline.data}
            initialStep={baselineEditStep}
            focus={baselineEditFocus}
            onSaved={(saved) => {
              queryClient.setQueryData(["baseline"], saved);
              setIsEditingBaseline(false);
            }}
            onCancel={baseline.data ? () => setIsEditingBaseline(false) : undefined}
          />
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card
                title={t.ui.physicalDataHealth}
                eyebrow={t.ui.profileAnamnesis}
                className="border-white/10"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-lime-400/10 px-3 py-1 text-xs font-semibold text-lime-300 ring-1 ring-inset ring-lime-400/30">
                    {experienceTierLabel(baseline.data.profile.experienceTier)}
                  </span>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300 ring-1 ring-inset ring-white/10">
                    {baseline.data.profile.sex} · {baseline.data.profile.heightCm} cm ·{" "}
                    {baseline.data.profile.weightKg} kg
                  </span>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300 ring-1 ring-inset ring-white/10">
                    {t.ui.updated} {formatDate(baseline.data.validFrom.slice(0, 10))}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3 text-xs">
                    <span className="text-slate-400">{t.ui.medicalInjuries}</span>
                    <p className="mt-1 font-semibold text-white">
                      {baseline.data.anamnesis.injuries.length === 0
                        ? t.ui.noActiveInjuries
                        : baseline.data.anamnesis.injuries
                            .map((injury) => `${injury.area} (${injury.painLevel}/10)`)
                            .join(", ")}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3 text-xs">
                    <span className="text-slate-400">{t.ui.conditions}</span>
                    <p className="mt-1 font-semibold text-white">
                      {baseline.data.anamnesis.conditions.length === 0
                        ? t.ui.noneReported
                        : baseline.data.anamnesis.conditions.join(", ")}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3 text-xs">
                    <span className="text-slate-400">{t.ui.medications}</span>
                    <p className="mt-1 font-semibold text-white">
                      {baseline.data.anamnesis.medications.length === 0
                        ? t.ui.none
                        : baseline.data.anamnesis.medications.join(", ")}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3 text-xs">
                    <span className="text-slate-400">{t.ui.sportsBackground}</span>
                    <p className="mt-1 font-semibold capitalize text-white">
                      {baseline.data.profile.athleteBackground ?? t.ui.notSet}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openBaselineEditor(1, "health")}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10"
                  >
                    {t.ui.editPhysicalData}
                  </button>
                  <button
                    type="button"
                    onClick={() => openBaselineEditor(2, "health")}
                    className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/20"
                  >
                    {t.ui.reportAProblem}
                  </button>
                </div>
              </Card>

              <Card
                title={t.ui.currentGoal}
                eyebrow={t.ui.trainingPlan}
                className="border-lime-400/20 bg-lime-950/10"
              >
                <h3 className="text-lg font-bold text-white">
                  {baseline.data.goals.primary.description}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  {baseline.data.goals.primary.targetDate
                    ? `${t.ui.targetDate} ${baseline.data.goals.primary.targetDate}`
                    : t.ui.noTargetDateThePlanUsesAStandardHorizon}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3 text-xs">
                    <span className="text-slate-400">{t.ui.activeSports}</span>
                    <p className="mt-1 font-semibold capitalize text-white">
                      {baseline.data.profile.sports
                        .map((sport) => t.planBoard.sports[sport] || sport)
                        .join(", ")}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3 text-xs">
                    <span className="text-slate-400">{t.ui.availability}</span>
                    <p className="mt-1 font-semibold text-white">
                      {baseline.data.availability.daysPerWeek ??
                        baseline.data.availability.days.length}{" "}
                      {t.ui.daysWeek} ·{" "}
                      {baseline.data.availability.longSession
                        ? baseline.data.availability.longSession.when === "weekend"
                          ? t.ui.longSessionAtTheWeekend
                          : `${t.ui.longSessionOn} ${baseline.data.availability.longSession.day ?? "—"}`
                        : t.ui.noDedicatedLongSession}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-black/20 p-3 text-xs sm:col-span-2">
                    <span className="text-slate-400">{t.ui.homeEquipment}</span>
                    <p className="mt-1 font-semibold text-white">
                      {baseline.data.equipment.items.length === 0
                        ? t.ui.noEquipmentReported
                        : baseline.data.equipment.items.join(", ")}
                      {baseline.data.equipment.gymAccess ? t.ui.gymAccess : ""}
                      {baseline.data.equipment.poolAccess ? t.ui.poolAccess : ""}
                    </p>
                  </div>
                </div>

                <GarminImportPanel />

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openBaselineEditor(3, "goal")}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10"
                  >
                    {t.ui.editGoal}
                  </button>
                  <button
                    type="button"
                    onClick={() => openBaselineEditor(4, "training")}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10"
                  >
                    {t.ui.availabilityEquipment}
                  </button>
                  <button
                    type="button"
                    onClick={() => feasibilityMutation.mutate()}
                    disabled={feasibilityMutation.isPending}
                    className="rounded-xl border border-lime-400/30 bg-lime-400/10 px-4 py-2.5 text-xs font-semibold text-lime-300 transition hover:bg-lime-400/20 disabled:opacity-60"
                  >
                    {feasibilityMutation.isPending
                      ? t.ui.calculatingFeasibility
                      : t.ui.verify5KFeasibility}
                  </button>
                </div>

                {feasibilityMutation.isError ? (
                  <p className="mt-3 text-xs leading-5 text-rose-300">
                    {feasibilityMutation.error.message}
                  </p>
                ) : null}
                {feasibilityMutation.data ? (
                  <FeasibilityResult result={feasibilityMutation.data} />
                ) : null}
              </Card>
            </div>

            <Card
              title={hasPlan ? t.ui.regeneratePlanTitle : t.ui.createPlanTitle}
              eyebrow={t.ui.trainingPlan}
              className="mt-4 border-sky-400/20 bg-sky-950/10"
            >
              <p className="text-xs leading-5 text-slate-300">
                {hasPlan ? t.ui.regeneratePlanDescription : t.ui.createPlanDescription}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsInterviewOpen(true)}
                  className="rounded-xl border border-lime-400/30 bg-lime-400/10 px-4 py-2.5 text-xs font-semibold text-lime-300 transition hover:bg-lime-400/20"
                >
                  {hasPlan ? t.ui.regeneratePlanWithTheCoach : t.ui.createPlan}
                </button>
              </div>

              <p className="mt-3 text-[11px] text-slate-400">{t.ui.methodologyChosenByTheCoach}</p>

              {methodology.data &&
              methodology.data.goalDescription === baseline.data.goals.primary.description ? (
                <MethodologyResult evaluation={methodology.data} />
              ) : null}

              {isInterviewOpen ? (
                <PlanInterviewChat onClose={() => setIsInterviewOpen(false)} />
              ) : null}
            </Card>
          </>
        )}
      </section>

      {/* Check-in Mattutino & Adattamento in Tempo Reale (Task 1.4) */}
      {baseline.data ? (
        <section className="mt-8">
          <MorningCheckinCard timeZone={baseline.data.profile.timezone} />
        </section>
      ) : null}

      {/* Board Settimanale e Sessione Oggi (Task 1.3) */}
      <TrainingPlanBoard hasBaseline={Boolean(baseline.data)} />

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card title="API" eyebrow="Runtime">
          <div className="flex items-center justify-between gap-4">
            <span>{t.ui.serviceStatus}</span>
            <StatusPill status={apiStatus} />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {health.isError
              ? t.ui.aPIUnreachableStartNpmRunDevApi
              : health.data
                ? `Uptime ${health.data.uptimeSec}s · ${new Date(health.data.timestamp).toLocaleTimeString()}`
                : t.ui.checking}
          </p>
        </Card>

        <Card title="MongoDB" eyebrow={t.ui.persistence}>
          <div className="flex items-center justify-between gap-4">
            <span>{t.ui.connection}</span>
            <StatusPill status={health.data?.checks.mongo.status ?? "unchecked"} />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {health.data?.checks.mongo.error ??
              (health.data?.checks.mongo.latencyMs !== undefined
                ? `${health.data.checks.mongo.latencyMs} ms`
                : t.ui.localMongoDBStartItAndRetry)}
          </p>
        </Card>

        <Card title="Garmin Personal" eyebrow={t.ui.integration}>
          <div className="flex items-center justify-between gap-4">
            <span>{t.ui.aPIKey}</span>
            <StatusPill status={health.data?.checks.garmin.status ?? "unchecked"} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => garminCheck.mutate()}
              disabled={garminCheck.isPending}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {garminCheck.isPending ? t.ui.checking_2 : t.ui.checkKey}
            </button>
            <button
              type="button"
              onClick={() => garminSync.mutate()}
              disabled={garminSync.isPending || overview.isLoading}
              className="rounded-xl bg-lime-300 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {garminSync.isPending ? t.ui.syncing : t.ui.syncNow}
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
                : (garminCheck.data.error ?? t.ui.checkFailed)}
            </p>
          ) : garminCheck.isError ? (
            <p className="mt-3 text-xs leading-5 text-rose-300">{garminCheck.error.message}</p>
          ) : null}
          {garminSync.isSuccess ? (
            <p className="mt-3 text-xs leading-5 text-emerald-300">
              Sync {garminSync.data.status}: {garminSync.data.activities} {t.ui.activities},{" "}
              {garminSync.data.metrics} {t.ui.metricDays}.
            </p>
          ) : garminSync.isError ? (
            <p className="mt-3 text-xs leading-5 text-rose-300">{garminSync.error.message}</p>
          ) : null}
        </Card>

        <Card title={t.ui.sharedDomain} eyebrow={t.ui.rules} className="lg:col-span-2">
          <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="flex h-24 w-24 flex-col items-center justify-center rounded-3xl bg-lime-300/10 ring-1 ring-inset ring-lime-300/30">
              <span className="text-3xl font-bold text-lime-300">{readiness.score}</span>
              <span className="text-[10px] uppercase tracking-widest text-lime-200/70">
                readiness
              </span>
            </div>
            <div>
              <p className="text-sm leading-6 text-slate-300">
                {locale === "it" ? (
                  <>
                    Calcolato da <code className="text-lime-300">@health-trainer/domain</code>: HRV,
                    RHR, sonno e check-in soggettivo. Confidenza{" "}
                    <strong className="text-white">{readiness.confidence}</strong>.
                  </>
                ) : (
                  <>
                    Calculated by <code className="text-lime-300">@health-trainer/domain</code>:
                    HRV, RHR, sleep, and subjective check-in. Confidence{" "}
                    <strong className="text-white">{readiness.confidence}</strong>.
                  </>
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {readiness.flags.length === 0 ? (
                  <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
                    {t.ui.noFlags}
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

        <Card title={t.ui.phase1Complete} eyebrow={t.ui.mVPStatus}>
          <ul className="space-y-1.5 text-xs leading-5 text-slate-300">
            <li className="text-lime-300 font-semibold">{t.ui.baselineL06StepWizard}</li>
            <li className="text-lime-300 font-semibold">{t.ui.multisportMacroMicroPlan}</li>
            <li className="text-lime-300 font-semibold">{t.ui.morningCheckInRealTimeAdaptation}</li>
            <li className="text-lime-300 font-semibold">{t.ui.activityTrackingFITUpload}</li>
            <li className="text-lime-300 font-semibold">{t.ui.deterministicAICoachBriefing}</li>
            <li className="text-lime-300 font-semibold">{t.ui.fITHevyProExport}</li>
            <li className="text-lime-300 font-semibold">{t.ui.weeklyReviewProgression}</li>
            <li className="text-lime-300 font-semibold">{t.ui.jSONBackupDataSovereignty}</li>
          </ul>
        </Card>
      </div>

      <Card title={t.ui.garminData} eyebrow={t.ui.last7Days} className="mt-4">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <SyncPill status={data?.status ?? "never"} locale={locale} />
            <span>
              {data?.lastSync
                ? `${t.ui.lastSync} ${formatDateTime(data.lastSync)}`
                : t.ui.neverSynced}
            </span>
            <span className="text-slate-600">·</span>
            <span>
              {data?.counts.activities ?? 0} {t.ui.totalActivities}
            </span>
            <span className="text-slate-600">·</span>
            <span>
              {data?.counts.metrics ?? 0} {t.ui.metricDays}
            </span>
          </div>
          {data?.error ? <span className="text-xs text-rose-300">{data.error}</span> : null}
        </div>

        {overview.isLoading ? (
          <p className="py-6 text-sm text-slate-500">{t.ui.loadingGarminData}</p>
        ) : overview.isError ? (
          <p className="py-6 text-sm text-rose-300">{overview.error.message}</p>
        ) : !data || data.counts.activities === 0 ? (
          <p className="py-6 text-sm text-slate-500">
            {locale === "it" ? (
              <>
                Nessun dato ancora. Premi <strong className="text-white">Sincronizza ora</strong>.
              </>
            ) : (
              <>
                No data yet. Press <strong className="text-white">Sync now</strong>.
              </>
            )}
          </p>
        ) : (
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {t.ui.recentActivities}
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
                            {formatDate(activity.date)} ·{" "}
                            {t.planBoard.sports[activity.sport] || activity.sport}
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
                          ? t.ui.analyzingFIT
                          : t.ui.analyzeFIT}
                      </button>

                      {analysis ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[11px] font-semibold text-slate-400">
                            {t.ui.lLMPromptBriefing}
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
                {t.ui.dailyMetrics}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="pb-2 pr-3 font-medium">{t.ui.day}</th>
                      <th className="pb-2 pr-3 font-medium">RHR</th>
                      <th className="pb-2 pr-3 font-medium">HRV</th>
                      <th className="pb-2 pr-3 font-medium">{t.ui.sleep}</th>
                      <th className="pb-2 pr-3 font-medium">{t.ui.steps}</th>
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
                          {metric.steps !== null ? metric.steps.toLocaleString(t.ui.enUS) : "—"}
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

      <Card title={t.ui.yazioNutrition} eyebrow={t.ui.last7Days} className="mt-4">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <SyncPill status={yazioData?.status ?? "never"} locale={locale} />
            <span>
              {yazioData?.lastSync
                ? `${t.ui.lastSync} ${formatDateTime(yazioData.lastSync)}`
                : t.ui.neverSynced}
            </span>
            <span className="text-slate-600">·</span>
            <span>
              {yazioData?.counts.days ?? 0} {t.ui.days}
            </span>
            <span className="text-slate-600">·</span>
            <span>
              {yazioData?.counts.weightEntries ?? 0} {t.ui.weighIns}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => yazioCheck.mutate()}
              disabled={yazioCheck.isPending}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {yazioCheck.isPending ? t.ui.checking_2 : t.ui.checkYazio}
            </button>
            <button
              type="button"
              onClick={() => yazioSync.mutate()}
              disabled={yazioSync.isPending}
              className="rounded-xl bg-lime-300 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {yazioSync.isPending ? t.ui.syncing : t.ui.syncYazio}
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
              : (yazioCheck.data.error ?? t.ui.checkFailed)}
          </p>
        ) : yazioCheck.isError ? (
          <p className="mt-3 text-xs text-rose-300">{yazioCheck.error.message}</p>
        ) : null}
        {yazioSync.isSuccess ? (
          <p className="mt-3 text-xs text-emerald-300">
            Sync {yazioSync.data.status}: {yazioSync.data.nutritionDays} {t.ui.days},{" "}
            {yazioSync.data.weightEntries} {t.ui.weighIns}.
          </p>
        ) : yazioSync.isError ? (
          <p className="mt-3 text-xs text-rose-300">{yazioSync.error.message}</p>
        ) : null}

        {yazioOverview.isLoading ? (
          <p className="py-6 text-sm text-slate-500">{t.ui.loadingYazioData}</p>
        ) : yazioOverview.isError ? (
          <p className="py-6 text-sm text-rose-300">{yazioOverview.error.message}</p>
        ) : !yazioData || yazioData.days.length === 0 ? (
          <div className="py-6 text-sm text-slate-500">
            {yazioData?.configured === false ? (
              <p>
                {locale === "it" ? (
                  <>
                    Yazio non configurato. Aggiungi le credenziali in{" "}
                    <code className="text-slate-300">secrets/yazio.json</code> e riavvia l&apos;API.
                  </>
                ) : (
                  <>
                    Yazio not configured. Add credentials to{" "}
                    <code className="text-slate-300">secrets/yazio.json</code> and restart the API.
                  </>
                )}
              </p>
            ) : (
              <p>
                {locale === "it" ? (
                  <>
                    Nessun dato. Premi <strong className="text-white">Sincronizza Yazio</strong>.
                  </>
                ) : (
                  <>
                    No data. Press <strong className="text-white">Sync Yazio</strong>.
                  </>
                )}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="pb-2 pr-3 font-medium">{t.ui.day}</th>
                  <th className="pb-2 pr-3 font-medium">Kcal</th>
                  <th className="pb-2 pr-3 font-medium">{t.ui.protein}</th>
                  <th className="pb-2 pr-3 font-medium">{t.ui.carbs}</th>
                  <th className="pb-2 pr-3 font-medium">{t.ui.fat}</th>
                  <th className="pb-2 pr-3 font-medium">{t.ui.water}</th>
                  <th className="pb-2 pr-3 font-medium">{t.ui.weight}</th>
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

      <Card title={t.ui.exportGarminWorkoutFIT} eyebrow={t.ui.manualExport} className="mt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-white">{t.ui.k5800mRunningIntervals}</h3>
            <p className="mt-1 text-xs text-slate-400">
              {t.ui.warmUp10MinZone25800m415435Km200mRecoveryCoolDow}
            </p>
          </div>
          <DownloadButton
            url="/api/export/workouts/sample-5x800m.fit"
            filename="5x800m-intervals.fit"
            className="inline-flex items-center justify-center rounded-xl bg-lime-300 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-lime-200"
          >
            {t.ui.downloadWorkoutFIT}
          </DownloadButton>
        </div>
        <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs text-slate-400">
          <p className="font-medium text-slate-300">{t.ui.howToImportIntoGarminConnect}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>
              {t.ui.open}
              <a
                href="https://connect.garmin.com/modern/workouts"
                target="_blank"
                rel="noreferrer"
                className="text-lime-300 underline"
              >
                Garmin Connect Workouts
              </a>{" "}
              {t.ui.onYourComputer}
            </li>
            <li>
              {locale === "it" ? (
                <>
                  Clicca su <strong>Importa</strong> accanto a &quot;Crea un allenamento&quot;.
                </>
              ) : (
                <>
                  Click <strong>Import</strong> next to &quot;Create a Workout&quot;.
                </>
              )}
            </li>
            <li>
              {locale === "it" ? (
                <>
                  Trascina o seleziona il file{" "}
                  <code className="text-slate-200">5x800m-intervals.fit</code> scaricato.
                </>
              ) : (
                <>
                  Drag and drop or select the downloaded{" "}
                  <code className="text-slate-200">5x800m-intervals.fit</code> file.
                </>
              )}
            </li>
            <li>
              {locale === "it" ? (
                <>
                  In alternativa, collega l&apos;orologio via USB e copia il file nella cartella{" "}
                  <code className="text-slate-200">GARMIN/NewFiles/</code>.
                </>
              ) : (
                <>
                  Alternatively, connect your watch via USB and copy the file into the{" "}
                  <code className="text-slate-200">GARMIN/NewFiles/</code> folder.
                </>
              )}
            </li>
          </ol>
        </div>
      </Card>

      <Card title={t.system.dataManagementTitle} eyebrow={t.ui.privacyPortability} className="mt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-white">{t.ui.yourDataBelongsToYou}</h3>
            <p className="mt-1 text-xs text-slate-400">
              {t.ui.exportYourCompleteHistoryInOpenStandardJSONForma}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DownloadButton
              url="/api/export/backup"
              filename="health-trainer-backup.json"
              className="inline-flex items-center justify-center rounded-xl bg-lime-300 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-lime-200"
            >
              {t.system.backupExport}
            </DownloadButton>
            <label className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10">
              {t.system.restoreBackup}
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
                if (window.confirm(t.system.deleteConfirm)) {
                  wipeDataMutation.mutate();
                }
              }}
              disabled={wipeDataMutation.isPending}
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
            >
              {wipeDataMutation.isPending ? t.common.loading : t.system.deleteAthleteData}
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
        <span>health-trainer · {t.ui.documentationInDocs}</span>
        <span>{t.ui.stravaExcludedLocalFirstHealthDataOnAndroid}</span>
      </footer>
    </main>
  );
}

function Splash() {
  const { t } = useI18n();
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="rounded-3xl border border-white/10 bg-white/[0.035] px-8 py-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-300 font-black text-slate-950">
          HT
        </div>
        <p className="text-sm text-slate-400">{t.common.loading}</p>
      </div>
    </main>
  );
}

function LoginScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["auth-status"], queryFn: fetchAuthStatus, retry: 1 });
  const [authError, setAuthError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const applyUser = (user: SessionUser) => {
    setAuthError(null);
    setPassword("");
    queryClient.setQueryData(["me"], user);
  };
  const fail = (error: Error) => setAuthError(error.message);

  const googleLogin = useMutation({
    mutationFn: loginWithGoogle,
    onSuccess: applyUser,
    onError: fail,
  });

  const devLogin = useMutation({
    mutationFn: loginDev,
    onSuccess: async () => {
      setAuthError(null);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: fail,
  });

  const localLogin = useMutation({
    mutationFn: loginLocal,
    onSuccess: applyUser,
    onError: fail,
  });

  const localRegister = useMutation({
    mutationFn: registerLocal,
    onSuccess: applyUser,
    onError: fail,
  });

  const googleReady = Boolean(
    status.data?.googleConfigured &&
      status.data.googleClientId &&
      status.data.allowedEmailsCount > 0,
  );
  const localReady = Boolean(status.data?.localAuthEnabled);
  const localPending = localLogin.isPending || localRegister.isPending;

  function switchMode(next: "login" | "register") {
    setMode(next);
    setAuthError(null);
  }

  function submitLocal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);
    if (mode === "login") {
      localLogin.mutate({ email: email.trim(), password });
      return;
    }
    localRegister.mutate({
      email: email.trim(),
      password,
      name: name.trim() || undefined,
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.035] p-8 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-300 font-black text-slate-950">
            HT
          </div>
          <LanguageSelector />
        </div>
        <h1 className="text-xl font-semibold text-white">{t.auth.welcomeTitle}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{t.auth.welcomeSubtitle}</p>

        {localReady ? (
          <>
            <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={cn(
                  "rounded-lg px-3 py-2 text-xs font-semibold transition",
                  mode === "login"
                    ? "bg-lime-300 text-slate-950"
                    : "text-slate-300 hover:text-white",
                )}
              >
                {t.auth.signInTab}
              </button>
              <button
                type="button"
                onClick={() => switchMode("register")}
                className={cn(
                  "rounded-lg px-3 py-2 text-xs font-semibold transition",
                  mode === "register"
                    ? "bg-lime-300 text-slate-950"
                    : "text-slate-300 hover:text-white",
                )}
              >
                {t.auth.createAccountTab}
              </button>
            </div>

            <form onSubmit={submitLocal} className="mt-4 space-y-3">
              {mode === "register" ? (
                <label className="block text-xs text-slate-400">
                  {t.auth.nameLabel}
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    maxLength={100}
                    placeholder={t.auth.namePlaceholder}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-lime-300/60 focus:outline-none"
                  />
                </label>
              ) : null}
              <label className="block text-xs text-slate-400">
                {t.auth.emailLabel}
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder={t.auth.emailPlaceholder}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-lime-300/60 focus:outline-none"
                />
              </label>
              <label className="block text-xs text-slate-400">
                {t.auth.passwordLabel}
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "register" ? 8 : undefined}
                  maxLength={128}
                  placeholder={
                    mode === "register"
                      ? t.auth.passwordPlaceholderRegister
                      : t.auth.passwordPlaceholderLogin
                  }
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-lime-300/60 focus:outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={localPending || googleLogin.isPending}
                className="w-full rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {localPending
                  ? mode === "login"
                    ? t.auth.signingIn
                    : t.auth.creatingAccount
                  : mode === "login"
                    ? t.auth.signInButton
                    : t.auth.createAccountButton}
              </button>
            </form>
          </>
        ) : null}

        {localReady ? (
          <div className="mt-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] uppercase tracking-widest text-slate-500">
              {t.common.or}
            </span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
        ) : null}

        {status.data ? (
          <div className="mt-5">
            {googleReady && status.data.googleClientId ? (
              <GoogleSignInButton
                clientId={status.data.googleClientId}
                onCredential={(idToken) => googleLogin.mutate(idToken)}
              />
            ) : (
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-400 opacity-70"
              >
                {t.auth.continueWithGoogle}
              </button>
            )}
            {googleLogin.isPending ? (
              <p className="mt-2 text-center text-xs text-slate-400">{t.auth.verifyingGoogle}</p>
            ) : null}
            {!googleReady ? (
              <p className="mt-2 text-center text-[11px] leading-4 text-slate-500">
                {status.data.googleConfigured
                  ? t.auth.googleEmptyAllowlist
                  : t.auth.googleNotConfigured}
              </p>
            ) : null}
          </div>
        ) : null}

        {status.data?.devLoginEnabled ? (
          <button
            type="button"
            onClick={() => devLogin.mutate()}
            disabled={devLogin.isPending || googleLogin.isPending || localPending}
            className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
          >
            {devLogin.isPending ? t.auth.signingIn : t.auth.devLoginButton}
          </button>
        ) : null}

        {!localReady && !googleReady && !status.data?.devLoginEnabled && status.data ? (
          <p className="mt-6 rounded-xl bg-rose-400/10 p-3 text-xs leading-5 text-rose-200 ring-1 ring-rose-400/30">
            {t.auth.noAuthMethod}
          </p>
        ) : null}

        {authError ? (
          <p className="mt-4 rounded-xl bg-rose-400/10 p-3 text-xs leading-5 text-rose-200 ring-1 ring-rose-400/30">
            {authError}
          </p>
        ) : null}

        {status.isError ? (
          <p className="mt-4 text-xs text-rose-300">{t.auth.apiUnreachable}</p>
        ) : null}
      </div>
    </main>
  );
}

export default function App() {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: 0,
    refetchInterval: false,
  });

  if (me.isLoading) return <Splash />;
  if (!me.data) return <LoginScreen />;
  return <Dashboard user={me.data} />;
}
