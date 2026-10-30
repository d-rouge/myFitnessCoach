import type {
  MacroPlan,
  MicroPlan,
  PlannedSession,
  SessionComparisonResult,
  Sport,
} from "@health-trainer/domain";
import { cn } from "@health-trainer/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useState } from "react";
import { useI18n } from "../i18n";
import { apiFetch, getHevyApiKey, setHevyApiKey } from "../lib/api";
import { DownloadButton } from "./DownloadButton";
import { WeeklyReviewCard } from "./WeeklyReviewCard";

interface CoachAdvice {
  headline: string;
  readinessSummary: string;
  workoutFocus: string;
  tips: string[];
  encouragement: string;
  caution?: string;
}

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

interface CoachAdviceResponse {
  advice: CoachAdvice;
  meta: {
    provider: string;
    model: string;
    latencyMs: number;
    promptVersion: string;
  };
}

const SPORT_COLORS: Record<Sport, { bg: string; text: string; ring: string }> = {
  running: { bg: "bg-sky-400/10", text: "text-sky-300", ring: "ring-sky-400/30" },
  cycling: { bg: "bg-amber-400/10", text: "text-amber-300", ring: "ring-amber-400/30" },
  swimming: { bg: "bg-teal-400/10", text: "text-teal-300", ring: "ring-teal-400/30" },
  strength: { bg: "bg-purple-400/10", text: "text-purple-300", ring: "ring-purple-400/30" },
  mobility: { bg: "bg-emerald-400/10", text: "text-emerald-300", ring: "ring-emerald-400/30" },
  other: { bg: "bg-slate-400/10", text: "text-slate-300", ring: "ring-slate-400/30" },
};

export async function fetchMacroPlan(): Promise<MacroPlan | null> {
  const res = await apiFetch("/api/plan/macro");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load macro plan");
  return res.json() as Promise<MacroPlan>;
}

async function fetchMicroPlan(): Promise<MicroPlan | null> {
  const res = await apiFetch("/api/plan/micro");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load micro plan");
  return res.json() as Promise<MicroPlan>;
}

async function fetchTodaySession(): Promise<TodaySessionResponse> {
  const res = await apiFetch("/api/plan/today");
  if (!res.ok) throw new Error("Failed to load today's session");
  return res.json() as Promise<TodaySessionResponse>;
}

async function fetchCoachAdvice(sessionId?: string): Promise<CoachAdviceResponse> {
  const res = await apiFetch("/api/ai/coach-advice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error("Failed to load coach advice");
  return res.json() as Promise<CoachAdviceResponse>;
}

async function generatePlan(): Promise<{ macroPlan: MacroPlan; microPlan: MicroPlan }> {
  const res = await apiFetch("/api/plan/macro/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to generate plan");
  }
  return res.json() as Promise<{ macroPlan: MacroPlan; microPlan: MicroPlan }>;
}

async function recordManualActivityApi(payload: {
  sessionId?: string;
  durationMin: number;
  distanceKm?: number;
  avgHr?: number;
  rpe?: number;
  notes?: string;
}): Promise<{ comparison?: SessionComparisonResult }> {
  const res = await apiFetch("/api/activities/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to save manual activity");
  }
  return res.json() as Promise<{ comparison?: SessionComparisonResult }>;
}

async function uploadFitApi(payload: {
  base64: string;
  filename: string;
}): Promise<{ comparison?: SessionComparisonResult }> {
  const res = await apiFetch("/api/activities/upload-fit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to upload FIT file");
  }
  return res.json() as Promise<{ comparison?: SessionComparisonResult }>;
}

async function exportHevyApi(input: {
  sessionId?: string;
  apiKey?: string;
}): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch("/api/export/workouts/hevy/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to export to Hevy");
  }
  return res.json() as Promise<{ success: boolean; message: string }>;
}

export function TrainingPlanBoard({ hasBaseline }: TrainingPlanBoardProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedAlternative, setSelectedAlternative] = useState<string | null>(null);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordDuration, setRecordDuration] = useState("30");
  const [recordDistance, setRecordDistance] = useState("");
  const [recordHr, setRecordHr] = useState("");
  const [recordRpe, setRecordRpe] = useState("5");
  const [recordNotes, setRecordNotes] = useState("");
  const [lastComparison, setLastComparison] = useState<SessionComparisonResult | null>(null);
  const [hevyFeedback, setHevyFeedback] = useState<string | null>(null);
  const [hevyApiKey, setHevyApiKeyState] = useState(() => getHevyApiKey());

  const macro = useQuery({ queryKey: ["macro-plan"], queryFn: fetchMacroPlan });
  const micro = useQuery({ queryKey: ["micro-plan"], queryFn: fetchMicroPlan });
  const today = useQuery({ queryKey: ["today-session"], queryFn: fetchTodaySession });

  const coachAdvice = useQuery({
    queryKey: ["coach-advice", today.data?.session?.id],
    queryFn: () => fetchCoachAdvice(today.data?.session?.id),
    enabled: Boolean(today.data?.session),
  });

  const generateMutation = useMutation({
    mutationFn: generatePlan,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["macro-plan"] });
      await queryClient.invalidateQueries({ queryKey: ["micro-plan"] });
      await queryClient.invalidateQueries({ queryKey: ["today-session"] });
      await queryClient.invalidateQueries({ queryKey: ["latest-review"] });
    },
  });

  const manualRecordMutation = useMutation({
    mutationFn: recordManualActivityApi,
    onSuccess: async (data) => {
      if (data.comparison) setLastComparison(data.comparison);
      setShowRecordForm(false);
      await queryClient.invalidateQueries({ queryKey: ["micro-plan"] });
      await queryClient.invalidateQueries({ queryKey: ["today-session"] });
    },
  });

  const uploadFitMutation = useMutation({
    mutationFn: uploadFitApi,
    onSuccess: async (data) => {
      if (data.comparison) setLastComparison(data.comparison);
      await queryClient.invalidateQueries({ queryKey: ["micro-plan"] });
      await queryClient.invalidateQueries({ queryKey: ["today-session"] });
    },
  });

  const exportHevyMutation = useMutation({
    mutationFn: exportHevyApi,
    onSuccess: (data) => {
      setHevyFeedback(data.message);
    },
    onError: (err) => {
      setHevyFeedback(err.message);
    },
  });

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      uploadFitMutation.mutate({ base64, filename: file.name });
    };
    reader.readAsArrayBuffer(file);
  };

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
            {t.planBoard.badge}
          </span>
          <h2 className="mt-1 text-2xl font-bold text-white">
            {macro.data ? macro.data.goalDescription : t.planBoard.title}
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {macro.data
              ? `${macro.data.totalWeeks} ${t.common.weeks} · ${t.planBoard.structure}`
              : t.planBoard.noBaselineNotice}
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
              ? t.planBoard.generatingPlan
              : hasPlan
                ? t.planBoard.generatePlan
                : t.planBoard.generatePlan}
          </button>
        </div>
      </div>

      {generateMutation.isError && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
          {generateMutation.error.message}
        </div>
      )}

      {hasPlan && (
        <>
          {/* Card "TODAY" */}
          <div className="rounded-3xl border border-lime-400/30 bg-lime-950/20 p-6 shadow-2xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-lime-400">
                  {t.planBoard.todayWorkout} · {today.data?.today ?? ""}
                </span>
                <h3 className="mt-1 text-xl font-bold text-white">
                  {today.data?.session ? today.data.session.title : t.planBoard.restDayTitle}
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
                    {t.planBoard.sports[today.data.session.sport] ??
                      today.data.session.sport.toUpperCase()}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
                      today.data.session.status === "completed"
                        ? "bg-emerald-400/20 text-emerald-300 ring-emerald-400/30"
                        : "bg-white/10 text-slate-300 ring-white/10",
                    )}
                  >
                    {today.data.session.status === "completed"
                      ? t.common.success
                      : t.wizard.step3.title}
                  </span>
                </div>
              ) : null}
            </div>

            {today.data?.session ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                  <span>{t.planBoard.duration(today.data.session.durationMin)}</span>
                  <span>·</span>
                  <span>
                    {t.planBoard.targetIntensity(
                      `RPE ${today.data.session.intensity.rpe}/10 (${today.data.session.intensity.target})`,
                    )}
                  </span>
                  <span>·</span>
                  <span>
                    <strong className="capitalize text-white">{today.data.session.location}</strong>
                  </span>
                </div>

                {/* AI Coach Advice Box */}
                {coachAdvice.data?.advice && (
                  <div className="rounded-2xl border border-lime-400/20 bg-lime-400/5 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-lime-400">
                        {t.planBoard.coachAdviceTitle}
                      </span>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
                        {coachAdvice.data.meta.model} ({coachAdvice.data.meta.latencyMs}ms)
                      </span>
                    </div>
                    <p className="mt-1 font-semibold text-white text-sm">
                      {coachAdvice.data.advice.headline}
                    </p>
                    <p className="mt-1 text-xs text-slate-300">
                      {coachAdvice.data.advice.workoutFocus}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {coachAdvice.data.advice.readinessSummary}
                    </p>

                    {coachAdvice.data.advice.caution && (
                      <div className="mt-2 rounded-xl bg-amber-400/10 p-2.5 text-xs text-amber-300 ring-1 ring-amber-400/20">
                        <strong>{t.planBoard.cautionLabel}:</strong>{" "}
                        {coachAdvice.data.advice.caution}
                      </div>
                    )}

                    <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-slate-400">
                      {coachAdvice.data.advice.tips.map((tip: string) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>

                    <p className="mt-2 text-xs italic text-lime-300/90">
                      &ldquo;{coachAdvice.data.advice.encouragement}&rdquo;
                    </p>
                  </div>
                )}

                {/* Structured Blocks */}
                <div className="rounded-2xl border border-white/5 bg-black/30 p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {t.planBoard.structure}
                  </span>
                  <div className="mt-3 space-y-2">
                    {today.data.session.blocks.map((block, bIdx) => {
                      const blockKey = `block-${bIdx}-${block.repeat}-${block.steps.length}`;
                      return (
                        <div key={blockKey} className="space-y-1.5">
                          {block.repeat > 1 && (
                            <p className="text-xs font-bold text-lime-400">{block.repeat}×:</p>
                          )}
                          {block.steps.map((step, sIdx) => {
                            const stepKey = `step-${bIdx}-${sIdx}-${step.kind}-${step.durationMin ?? step.distanceM ?? ""}`;
                            return (
                              <div
                                key={stepKey}
                                className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3 py-2 text-xs"
                              >
                                <span className="font-semibold capitalize text-white">
                                  {step.kind}
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
                {today.data.session.alternatives.length > 0 && (
                  <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-xs">
                    <span className="font-semibold text-slate-300">
                      {t.planBoard.alternatives}:
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
                )}

                {/* Last Comparison Feedback */}
                {lastComparison && (
                  <div className="rounded-2xl border border-emerald-400/30 bg-emerald-950/20 p-4 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-300">
                        {t.planBoard.comparisonTitle}:
                      </span>
                      <span className="font-bold text-white">
                        {lastComparison.adherenceScore}% {t.review.metrics.adherenceScore}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-300">{lastComparison.summary}</p>
                    {lastComparison.flags.length > 0 && (
                      <p className="mt-1 text-amber-300">
                        Flags: {lastComparison.flags.join(", ")}
                      </p>
                    )}
                  </div>
                )}

                {/* Hevy Feedback */}
                {hevyFeedback && (
                  <div className="rounded-2xl border border-purple-400/30 bg-purple-950/20 p-3 text-xs text-purple-300">
                    {hevyFeedback}
                  </div>
                )}

                {/* Manual Record Form Toggle */}
                {showRecordForm && (
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                      {t.planBoard.manualLogTitle}
                    </h4>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div>
                        <span className="text-[11px] text-slate-400 block mb-1">
                          {t.planBoard.manualDuration}
                        </span>
                        <input
                          type="number"
                          value={recordDuration}
                          onChange={(e) => setRecordDuration(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block mb-1">
                          {t.planBoard.manualDistance}
                        </span>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="5.0"
                          value={recordDistance}
                          onChange={(e) => setRecordDistance(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block mb-1">
                          {t.integrations.avgHr} (bpm)
                        </span>
                        <input
                          type="number"
                          placeholder="145"
                          value={recordHr}
                          onChange={(e) => setRecordHr(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block mb-1">
                          {t.planBoard.manualRpe}
                        </span>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={recordRpe}
                          onChange={(e) => setRecordRpe(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block mb-1">
                        {t.planBoard.manualNotes}
                      </span>
                      <input
                        type="text"
                        value={recordNotes}
                        onChange={(e) => setRecordNotes(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10">
                          {t.planBoard.uploadFit}
                          <input
                            type="file"
                            accept=".fit"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                        {uploadFitMutation.isPending && (
                          <span className="text-xs text-slate-400">{t.planBoard.uploadingFit}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowRecordForm(false)}
                          className="rounded-xl px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                        >
                          {t.common.cancel}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            manualRecordMutation.mutate({
                              sessionId: today.data?.session?.id,
                              durationMin: Number.parseInt(recordDuration, 10) || 30,
                              distanceKm: recordDistance
                                ? Number.parseFloat(recordDistance)
                                : undefined,
                              avgHr: recordHr ? Number.parseInt(recordHr, 10) : undefined,
                              rpe: Number.parseInt(recordRpe, 10) || 5,
                              notes: recordNotes || undefined,
                            });
                          }}
                          disabled={manualRecordMutation.isPending}
                          className="rounded-xl bg-lime-400 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-lime-300 disabled:opacity-50"
                        >
                          {manualRecordMutation.isPending
                            ? t.planBoard.manualSaving
                            : t.planBoard.manualSave}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {today.data.session.sport === "strength" && (
                  <div className="rounded-2xl border border-purple-400/20 bg-purple-950/10 p-3">
                    <label
                      htmlFor="hevy-api-key"
                      className="block text-[11px] font-semibold uppercase tracking-wider text-purple-200"
                    >
                      {t.planBoard.hevyApiKey}
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        id="hevy-api-key"
                        type="password"
                        value={hevyApiKey}
                        onChange={(event) => setHevyApiKeyState(event.target.value)}
                        placeholder="HEVY_API_KEY"
                        autoComplete="off"
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setHevyApiKey(hevyApiKey);
                          setHevyFeedback(
                            hevyApiKey.trim() ? t.planBoard.hevyConfigured : t.common.none,
                          );
                        }}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                      >
                        {t.planBoard.saveHevyKey}
                      </button>
                    </div>
                  </div>
                )}

                {/* Session Actions & Exports */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* FIT Export for Cardio */}
                    {(today.data.session.sport === "running" ||
                      today.data.session.sport === "cycling" ||
                      today.data.session.sport === "swimming") && (
                      <DownloadButton
                        url={`/api/export/workouts/session/${today.data.session.id}.fit`}
                        filename={`${today.data.session.id}.fit`}
                        className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-300 transition hover:bg-sky-400/20"
                      >
                        {t.planBoard.downloadFit}
                      </DownloadButton>
                    )}

                    {/* Hevy Export for Strength */}
                    {today.data.session.sport === "strength" && (
                      <button
                        type="button"
                        onClick={() =>
                          exportHevyMutation.mutate({
                            sessionId: today.data?.session?.id,
                            apiKey: hevyApiKey.trim() || undefined,
                          })
                        }
                        disabled={exportHevyMutation.isPending}
                        className="rounded-xl border border-purple-400/30 bg-purple-400/10 px-3 py-2 text-xs font-semibold text-purple-300 transition hover:bg-purple-400/20 disabled:opacity-50"
                      >
                        {exportHevyMutation.isPending ? t.common.loading : t.planBoard.syncHevy}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowRecordForm(!showRecordForm)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                    >
                      {showRecordForm ? t.common.close : t.planBoard.recordActivity}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {today.data.session.status === "completed" ? (
                      <span className="rounded-xl bg-emerald-400/20 px-4 py-2 text-xs font-bold text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
                        {t.common.success}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-slate-400">{t.planBoard.restDayMessage}</p>
            )}
          </div>

          {/* Weekly Board */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {t.planBoard.macrocycleInfo(
                    micro.data?.weekIndex ?? 1,
                    macro.data?.totalWeeks ?? 1,
                  )}
                </span>
                <h3 className="mt-0.5 text-lg font-bold text-white">{t.planBoard.weeksList}</h3>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>
                  {t.wizard.step4.sessionDuration}: {micro.data?.weeklyVolumeMin} min
                </span>
                {micro.data?.deload ? (
                  <span className="rounded-full bg-amber-400/10 px-2.5 py-0.5 text-amber-300 ring-1 ring-inset ring-amber-400/30">
                    {t.review.decisions.deload}
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
                          {t.planBoard.sports[sess.sport] ?? sess.sport}
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
                        {isCompleted ? t.common.success : t.common.loading}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weekly Review Component */}
          <WeeklyReviewCard />

          {/* Macrocycle Timeline */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {t.baseline.periodization}
            </span>
            <h3 className="mt-1 text-lg font-bold text-white">{t.planBoard.title}</h3>
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
                          {idx + 1}
                        </span>
                        <strong className="text-sm text-white">{phase.name}</strong>
                        {isCurrent && (
                          <span className="rounded-full bg-lime-400/20 px-2 py-0.5 text-[10px] font-bold uppercase text-lime-300">
                            {t.planBoard.currentPhase(phase.name)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-300">{phase.focus}</p>
                    </div>

                    <div className="text-right text-xs text-slate-400 whitespace-nowrap">
                      <span>
                        {t.common.weeks} {phase.startWeek}–{phase.endWeek}
                      </span>
                      {phase.weeklyVolumeMin ? (
                        <p className="text-slate-500">
                          ~{phase.weeklyVolumeMin} min/{t.common.weeks}
                        </p>
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
