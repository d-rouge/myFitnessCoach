import { computeReadiness } from "@health-trainer/domain";
import { cn } from "@health-trainer/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

type CheckStatus = "ok" | "error" | "configured" | "missing" | "unchecked";

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

const readiness = computeReadiness({
  hrvToday: 68,
  hrvBaseline: { mean: 62, sd: 6 },
  rhrToday: 51,
  rhrBaseline: { mean: 54, sd: 3 },
  sleepMinutes: 465,
  sleepNeedMinutes: 480,
  subjective: { energy: 4, mood: 4, stress: 2, soreness: 2 },
});

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
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth });
  const garmin = useMutation({ mutationFn: checkGarmin });

  const apiStatus = health.isError ? "error" : health.data ? "ok" : "unchecked";

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
                : "MongoDB locale: `brew services start mongodb-community`.")}
          </p>
        </Card>

        <Card title="Garmin Personal" eyebrow="Integrazione">
          <div className="flex items-center justify-between gap-4">
            <span>Chiave API</span>
            <StatusPill status={health.data?.checks.garmin.status ?? "unchecked"} />
          </div>
          <button
            type="button"
            onClick={() => garmin.mutate()}
            disabled={garmin.isPending}
            className="mt-4 w-full rounded-xl bg-lime-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {garmin.isPending ? "Verifica in corso…" : "Verifica chiave Garmin"}
          </button>
          {garmin.data ? (
            <p
              className={cn(
                "mt-3 text-xs leading-5",
                garmin.data.ok ? "text-emerald-300" : "text-rose-300",
              )}
            >
              {garmin.data.ok
                ? `OK · ${garmin.data.latencyMs} ms`
                : (garmin.data.error ?? "Verifica fallita")}
            </p>
          ) : garmin.isError ? (
            <p className="mt-3 text-xs leading-5 text-rose-300">{garmin.error.message}</p>
          ) : (
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Richiede `GARMIN_PERSONAL_API_KEY` nel `.env` e l&apos;endpoint dev abilitato.
            </p>
          )}
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
            <li>1. Testare la chiave Garmin reale</li>
            <li>2. Salvare i risultati in `docs/spikes/garmin.md`</li>
            <li>3. Aggiungere Yazio, Zepp e Hevy</li>
            <li>4. Chiudere lo scaffold auth + onboarding</li>
          </ol>
        </Card>
      </div>

      <footer className="mt-auto flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>health-trainer · documentazione in `docs/`</span>
        <span>Strava escluso · dati salute local-first su Android</span>
      </footer>
    </main>
  );
}
