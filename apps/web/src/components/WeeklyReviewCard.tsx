import type { Review } from "@health-trainer/domain";
import { cn } from "@health-trainer/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "../i18n";
import { apiFetch } from "../lib/api";

async function fetchLatestReview(): Promise<Review | null> {
  const res = await apiFetch("/api/review/latest");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch review");
  return res.json() as Promise<Review>;
}

async function triggerWeeklyReview(): Promise<Review> {
  const res = await apiFetch("/api/review/weekly", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to calculate weekly review");
  }
  return res.json() as Promise<Review>;
}

async function triggerAdvanceWeek(): Promise<{ review: Review }> {
  const res = await apiFetch("/api/review/advance-week", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to advance week");
  }
  return res.json() as Promise<{ review: Review }>;
}

export function WeeklyReviewCard() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const reviewQuery = useQuery({
    queryKey: ["latest-review"],
    queryFn: fetchLatestReview,
  });

  const reviewMutation = useMutation({
    mutationFn: triggerWeeklyReview,
    onSuccess: (data) => {
      queryClient.setQueryData(["latest-review"], data);
      queryClient.invalidateQueries({ queryKey: ["micro-plan"] });
    },
  });

  const advanceMutation = useMutation({
    mutationFn: triggerAdvanceWeek,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["macro-plan"] });
      queryClient.invalidateQueries({ queryKey: ["micro-plan"] });
      queryClient.invalidateQueries({ queryKey: ["today-session"] });
      queryClient.invalidateQueries({ queryKey: ["latest-review"] });
    },
  });

  const review = reviewQuery.data;

  const decisionBadgeClass = (decision: string) => {
    switch (decision) {
      case "progress":
        return "bg-lime-400/20 text-lime-300 ring-lime-400/30";
      case "deload":
        return "bg-amber-400/20 text-amber-300 ring-amber-400/30";
      default:
        return "bg-sky-400/20 text-sky-300 ring-sky-400/30";
    }
  };

  const decisionLabel = (decision: string) => {
    switch (decision) {
      case "progress":
        return t.review.decisions.progress;
      case "deload":
        return t.review.decisions.deload;
      default:
        return t.review.decisions.maintain;
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lime-400">
            {t.review.badge}
          </span>
          <h3 className="mt-1 text-xl font-bold text-white">{t.review.title}</h3>
          <p className="mt-1 text-xs text-slate-400">{t.review.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => reviewMutation.mutate()}
            disabled={reviewMutation.isPending}
            className="rounded-xl border border-lime-400/30 bg-lime-400/10 px-4 py-2 text-xs font-semibold text-lime-300 transition hover:bg-lime-400/20 disabled:opacity-50"
          >
            {reviewMutation.isPending ? t.review.calculating : t.review.calculateNow}
          </button>
        </div>
      </div>

      {reviewMutation.isError && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          {reviewMutation.error.message}
        </div>
      )}

      {advanceMutation.isError && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          {advanceMutation.error.message}
        </div>
      )}

      {review && (
        <div className="mt-6 space-y-4 rounded-2xl border border-white/5 bg-black/20 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                {review.startDate} → {review.endDate}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-slate-400">
                {t.review.metrics.completedSessions}:{" "}
                <strong className="text-white">
                  {review.completedSessionsCount} / {review.plannedSessionsCount}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{t.common.status}:</span>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset",
                  decisionBadgeClass(review.decision),
                )}
              >
                {decisionLabel(review.decision)}
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-white/[0.02] p-3 text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">
                {t.review.metrics.adherenceScore}
              </span>
              <p className="mt-1 text-2xl font-black text-lime-300">{review.adherencePct}%</p>
            </div>
            <div className="rounded-xl bg-white/[0.02] p-3 text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">
                {t.wizard.step4.sessionDuration}
              </span>
              <p className="mt-1 text-2xl font-black text-white">{review.totalDurationMin} min</p>
            </div>
            <div className="rounded-xl bg-white/[0.02] p-3 text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">
                {t.wizard.step2.injuriesTitle}
              </span>
              <p
                className={cn(
                  "mt-1 text-2xl font-black",
                  review.painEventsCount > 0 ? "text-amber-400" : "text-emerald-400",
                )}
              >
                {review.painEventsCount}
              </p>
            </div>
          </div>

          {review.methodologyReview ? (
            <p className="rounded-xl border border-sky-400/20 bg-sky-400/[0.06] p-3 text-xs text-sky-200">
              Metodologia {review.methodologyReview.refreshed ? "rivalutata" : "confermata"}:{" "}
              <strong>{review.methodologyReview.methodology}</strong> · confidenza{" "}
              {review.methodologyReview.confidence}
            </p>
          ) : null}

          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-semibold text-slate-300">{t.review.metrics.rationale}:</h4>
            <p className="text-xs leading-5 text-slate-400">{review.decisionRationale}</p>
          </div>

          {review.nextCycleRecommendations.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <h4 className="text-xs font-semibold text-slate-300">{t.planBoard.tips}:</h4>
              <ul className="list-inside list-disc space-y-1 text-xs text-slate-400">
                {review.nextCycleRecommendations.map((rec) => (
                  <li key={rec}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-end border-t border-white/5 pt-4">
            <button
              type="button"
              onClick={() => advanceMutation.mutate()}
              disabled={advanceMutation.isPending}
              className="rounded-xl bg-lime-400 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-lime-400/20 transition hover:bg-lime-300 disabled:opacity-50"
            >
              {advanceMutation.isPending ? t.review.advancing : t.review.advanceWeek}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
