import { computeReadiness } from "@health-trainer/domain";
import { cn } from "@health-trainer/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

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
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth });
  const overview = useQuery({ queryKey: ["garmin-overview"], queryFn: fetchGarminOverview });
  const garminCheck = useMutation({ mutationFn: checkGarmin });
  const garminSync = useMutation({
    mutationFn: syncGarmin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["garmin-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["health"] });
    },
  });

  const apiStatus = health.isError ? "error" : health.data ? "ok" : "unchecked";
  const data = overview.data;

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
          <span className="rounded-full bg-lime-300/10 px-3 py-1.5 text-xs font-semibold text-lime-300 ring-1 ring-inset ring-lime-300/30">
            Fase 0 · Fondamenta
          </span>
          <span className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-slate-400 ring-1 ring-inset ring-white/10">
            v0.1.0
          </span>
        </div>
      </header>

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

        <Card title="Prossimo passo" eyebrow="Fase 0">
          <ol className="space-y-2 text-sm leading-6 text-slate-300">
            <li>1. Sync Garmin persistente</li>
            <li>2. Spike Yazio (cibo e peso)</li>
            <li>3. Export workout `.FIT` verso Garmin</li>
            <li>4. Auth Google + onboarding</li>
          </ol>
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
                {data.activities.map((activity) => (
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
                  </li>
                ))}
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

      <footer className="mt-auto flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>health-trainer · documentazione in `docs/`</span>
        <span>Strava escluso · dati salute local-first su Android</span>
      </footer>
    </main>
  );
}
