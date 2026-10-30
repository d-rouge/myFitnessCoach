import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "../i18n";
import { apiFetch } from "../lib/api";

interface GarminActivitySummary {
  from: string;
  to: string;
  totalActivities: number;
  durationSeconds: number;
  bySport: Array<{ sport: string; activities: number; durationSeconds: number }>;
  entries: Array<{
    id: string;
    date: string;
    sport: string;
    title: string | null;
    durationSeconds: number;
  }>;
}

interface GarminSyncResult {
  status: "ok" | "partial";
  activities: number;
  errors: string[];
  message?: string;
}

async function fetchSummary(): Promise<GarminActivitySummary> {
  const response = await apiFetch("/api/integrations/garmin/activities/summary?days=90");
  if (!response.ok) {
    throw new Error(`Riepilogo Garmin non disponibile (${response.status})`);
  }
  return (await response.json()) as GarminActivitySummary;
}

async function syncLast90Days(): Promise<GarminSyncResult> {
  const response = await apiFetch("/api/integrations/garmin/sync?days=90", { method: "POST" });
  const body = (await response.json()) as GarminSyncResult;
  if (!response.ok) {
    throw new Error(body.message ?? `Sincronizzazione Garmin fallita (${response.status})`);
  }
  return body;
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

/**
 * Import Garmin nella scheda obiettivo: sincronizza gli ultimi 90 giorni e
 * mostra il totale ore usato per misurare la capacità. Il riepilogo viene
 * invalidato subito, così il numero non resta vecchio se il sync è parziale.
 */
export function GarminImportPanel() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const summary = useQuery({
    queryKey: ["garmin-activities-summary"],
    queryFn: fetchSummary,
  });
  const sync = useMutation({
    mutationFn: syncLast90Days,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["garmin-activities-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["garmin-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["baseline"] });
    },
  });

  const data = summary.data;

  return (
    <div className="mt-4 rounded-2xl border border-sky-400/20 bg-sky-400/[0.04] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
            {t.integrations.importTitle}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{t.integrations.importHint}</p>
        </div>
        <button
          type="button"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-300 transition hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-60"
        >
          {sync.isPending ? t.integrations.syncing : t.integrations.syncGarmin}
        </button>
      </div>

      {summary.isLoading ? (
        <p className="mt-2 text-[11px] text-slate-400">{t.common.loading}</p>
      ) : null}
      {summary.isError ? (
        <p className="mt-2 text-[11px] text-rose-300">
          {t.integrations.error}: {summary.error.message}
        </p>
      ) : null}
      {sync.isError ? (
        <p className="mt-2 text-[11px] text-rose-300">
          {t.integrations.error}: {sync.error.message}
        </p>
      ) : null}
      {sync.data ? (
        <p className="mt-2 text-[11px] text-emerald-300">
          {t.integrations.syncedActivities(sync.data.activities)}
        </p>
      ) : null}

      {data ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl bg-white/5 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              {t.integrations.activities90d}
            </p>
            <p className="mt-1 text-lg font-bold text-white">{data.totalActivities}</p>
          </div>
          <div className="rounded-xl bg-white/5 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              {t.integrations.totalHours}
            </p>
            <p className="mt-1 text-lg font-bold text-white">
              {formatDuration(data.durationSeconds)}
            </p>
          </div>
          {data.bySport.length > 0 ? (
            <div className="sm:col-span-2 rounded-xl bg-white/5 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">
                {t.integrations.bySport}
              </p>
              <p className="mt-1 text-[11px] text-slate-300">
                {data.bySport
                  .map(
                    (item) =>
                      `${item.sport}: ${item.activities} (${formatDuration(item.durationSeconds)})`,
                  )
                  .join(" · ")}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
