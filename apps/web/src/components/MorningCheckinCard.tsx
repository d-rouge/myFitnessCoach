import {
  type Checkin,
  type DailyAdjustmentResult,
  resolveTimeZone,
  todayLocalDate,
} from "@health-trainer/domain";
import { cn } from "@health-trainer/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "../lib/api";

interface TodayCheckinResponse {
  date: string;
  morning: Checkin | null;
  postSession: Checkin | null;
}

async function fetchTodayCheckin(): Promise<TodayCheckinResponse> {
  const res = await apiFetch("/api/checkin/today");
  if (!res.ok) throw new Error("Errore recupero check-in");
  return res.json() as Promise<TodayCheckinResponse>;
}

async function submitCheckin(data: Checkin): Promise<{
  checkin: Checkin;
  adjustment?: DailyAdjustmentResult;
}> {
  const res = await apiFetch("/api/checkin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? "Errore salvataggio check-in");
  }
  return res.json() as Promise<{
    checkin: Checkin;
    adjustment?: DailyAdjustmentResult;
  }>;
}

interface MorningCheckinCardProps {
  timeZone?: string | null;
}

export function MorningCheckinCard({ timeZone }: MorningCheckinCardProps) {
  const queryClient = useQueryClient();
  const todayCheckin = useQuery({
    queryKey: ["today-checkin"],
    queryFn: fetchTodayCheckin,
  });

  const [isOpen, setIsOpen] = useState(false);
  const [energy, setEnergy] = useState<number>(4);
  const [sleepQuality, setSleepQuality] = useState<number>(4);
  const [soreness, setSoreness] = useState<number>(1);
  const [painLevel, setPainLevel] = useState<number>(0);
  const [availableTimeMin, setAvailableTimeMin] = useState<number>(60);
  const [lastAdjustment, setLastAdjustment] = useState<DailyAdjustmentResult | null>(null);

  const mutation = useMutation({
    mutationFn: submitCheckin,
    onSuccess: async (data) => {
      if (data.adjustment) {
        setLastAdjustment(data.adjustment);
      }
      setIsOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["today-checkin"] });
      await queryClient.invalidateQueries({ queryKey: ["today-session"] });
      await queryClient.invalidateQueries({ queryKey: ["micro-plan"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Prefer the date computed by the API in the athlete's timezone; fall back
    // to the same timezone client-side if the query has not resolved yet.
    const today = todayCheckin.data?.date ?? todayLocalDate(resolveTimeZone(timeZone));
    mutation.mutate({
      date: today,
      type: "morning",
      energy,
      sleepQuality,
      soreness,
      pain: painLevel > 0 ? [{ area: "generale", intensity: painLevel, sharp: false }] : [],
      availableTimeMin,
    });
  };

  const hasMorningCheckin = Boolean(todayCheckin.data?.morning);
  const morningData = todayCheckin.data?.morning;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lime-400">
            Check-in Mattutino (20 sec)
          </span>
          <h3 className="mt-1 text-lg font-bold text-white">
            {hasMorningCheckin ? "Check-in di oggi registrato" : "Come ti senti questa mattina?"}
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            {hasMorningCheckin
              ? `Energia: ${morningData?.energy}/5 · Sonno: ${morningData?.sleepQuality}/5 · Tempo: ${morningData?.availableTimeMin} min`
              : "Valuta rapidamente energia, sonno e tempo disponibile per adattare l'allenamento odierno."}
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="rounded-xl border border-lime-400/30 bg-lime-400/10 px-4 py-2 text-xs font-bold text-lime-300 transition hover:bg-lime-400/20"
          >
            {hasMorningCheckin
              ? isOpen
                ? "Chiudi"
                : "Modifica Check-in"
              : isOpen
                ? "Annulla"
                : "Fai Check-in"}
          </button>
        </div>
      </div>

      {lastAdjustment && (
        <div className="mt-4 rounded-2xl border border-lime-400/20 bg-lime-950/20 p-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">Adattamento Giornaliero Calcolato:</span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 font-bold uppercase",
                lastAdjustment.decision === "confirm"
                  ? "bg-emerald-400/20 text-emerald-300"
                  : lastAdjustment.decision === "reduce"
                    ? "bg-amber-400/20 text-amber-300"
                    : lastAdjustment.decision === "swap"
                      ? "bg-sky-400/20 text-sky-300"
                      : "bg-rose-400/20 text-rose-300",
              )}
            >
              {lastAdjustment.decision === "confirm" && "Confermato"}
              {lastAdjustment.decision === "reduce" && "Volume Ridotto"}
              {lastAdjustment.decision === "swap" && "Alternativa Breve"}
              {lastAdjustment.decision === "rest" && "Riposo & Scarico"}
            </span>
          </div>
          <p className="mt-2 text-slate-300">{lastAdjustment.rationale}</p>
          {lastAdjustment.changes.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-slate-400">
              {lastAdjustment.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isOpen && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 border-t border-white/10 pt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <span className="block text-xs font-semibold text-slate-300">Energia (1–5)</span>
              <div className="mt-2 flex items-center justify-between gap-1">
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setEnergy(lvl)}
                    className={cn(
                      "flex-1 rounded-lg py-1.5 text-center text-xs font-bold transition",
                      energy === lvl
                        ? "bg-lime-400 text-slate-950"
                        : "border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10",
                    )}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-300">Sonno (1–5)</span>
              <div className="mt-2 flex items-center justify-between gap-1">
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSleepQuality(lvl)}
                    className={cn(
                      "flex-1 rounded-lg py-1.5 text-center text-xs font-bold transition",
                      sleepQuality === lvl
                        ? "bg-lime-400 text-slate-950"
                        : "border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10",
                    )}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-300">DOMS (0–5)</span>
              <div className="mt-2 flex items-center justify-between gap-1">
                {[0, 1, 2, 3, 4, 5].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSoreness(lvl)}
                    className={cn(
                      "flex-1 rounded-lg py-1.5 text-center text-xs font-bold transition",
                      soreness === lvl
                        ? "bg-amber-400 text-slate-950"
                        : "border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10",
                    )}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-300">Dolore (0–10)</span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={painLevel}
                  onChange={(e) => setPainLevel(Number.parseInt(e.target.value, 10) || 0)}
                  className="w-full accent-lime-400"
                />
                <span className="w-6 text-center font-mono text-xs font-bold text-white">
                  {painLevel}
                </span>
              </div>
            </div>

            <label className="block text-xs font-semibold text-slate-300">
              Tempo oggi (min)
              <input
                type="number"
                min={15}
                max={240}
                step={5}
                value={availableTimeMin}
                onChange={(e) => setAvailableTimeMin(Number.parseInt(e.target.value, 10) || 60)}
                className="mt-2 block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white"
              />
            </label>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-400">
              Se hai poco tempo o sei stanco, il piano si adatterà automaticamente.
            </span>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-xl bg-lime-400 px-5 py-2 text-xs font-bold text-slate-950 shadow-md transition hover:bg-lime-300 disabled:opacity-50"
            >
              {mutation.isPending ? "Invio…" : "Salva e Adatta"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
