import type { InterviewQuestion } from "@health-trainer/domain";
import { cn } from "@health-trainer/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { apiFetch } from "../lib/api";

export interface PlanInterview {
  id: string;
  status: "active" | "ready" | "generated";
  createdAt: string;
  updatedAt: string;
  messages: Array<{ role: "assistant" | "user"; content: string; createdAt: string }>;
  findings: Record<string, unknown>;
  questions: InterviewQuestion[];
  methodologyId?: string;
  planId?: string;
}

interface PlanInterviewChatProps {
  onClose: () => void;
}

async function fetchLatestInterview(): Promise<PlanInterview | null> {
  const response = await apiFetch("/api/plan/interview/latest");
  if (!response.ok) return null;
  const body = (await response.json()) as { interview: PlanInterview | null };
  return body.interview;
}

async function startInterview(input: { restart?: boolean } = {}): Promise<PlanInterview> {
  const response = await apiFetch(`/api/plan/interview${input.restart ? "?restart=true" : ""}`, {
    method: "POST",
  });
  const body = (await response.json()) as PlanInterview & { message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? `Interview start failed (${response.status})`);
  }
  return body;
}

async function sendInterviewMessage(input: {
  interviewId: string;
  message: string;
}): Promise<PlanInterview> {
  const response = await apiFetch(`/api/plan/interview/${input.interviewId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: input.message }),
  });
  const body = (await response.json()) as PlanInterview & { message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? `Failed to send message (${response.status})`);
  }
  return body;
}

async function generateFromInterview(interviewId: string): Promise<PlanInterview> {
  const response = await apiFetch(`/api/plan/interview/${interviewId}/generate`, {
    method: "POST",
  });
  const body = (await response.json()) as {
    interview: PlanInterview;
    message?: string;
    issues?: string[];
  };
  if (!response.ok) {
    throw new Error(
      body.message ?? body.issues?.join("; ") ?? `Plan generation failed (${response.status})`,
    );
  }
  return body.interview;
}

export function PlanInterviewChat({ onClose }: PlanInterviewChatProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const sectionRef = useRef<HTMLElement | null>(null);
  const latest = useQuery({
    queryKey: ["plan-interview-latest"],
    queryFn: fetchLatestInterview,
  });
  const startMutation = useMutation({
    mutationFn: startInterview,
    onSuccess: (interview) => {
      queryClient.setQueryData(["plan-interview-latest"], interview);
    },
  });
  const messageMutation = useMutation({
    mutationFn: sendInterviewMessage,
    onSuccess: (interview) => {
      queryClient.setQueryData(["plan-interview-latest"], interview);
    },
  });
  const generateMutation = useMutation({
    mutationFn: generateFromInterview,
    onSuccess: async (interview) => {
      queryClient.setQueryData(["plan-interview-latest"], interview);
      await queryClient.invalidateQueries({ queryKey: ["macro-plan"] });
      await queryClient.invalidateQueries({ queryKey: ["micro-plan"] });
      await queryClient.invalidateQueries({ queryKey: ["today-session"] });
      await queryClient.invalidateQueries({ queryKey: ["latest-review"] });
      await queryClient.invalidateQueries({ queryKey: ["methodology"] });
      await queryClient.invalidateQueries({ queryKey: ["baseline"] });
    },
  });

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoStarted = useRef(false);

  const interview =
    generateMutation.data ?? messageMutation.data ?? startMutation.data ?? latest.data ?? null;

  const pending =
    startMutation.isPending || messageMutation.isPending || generateMutation.isPending;
  const error =
    startMutation.error?.message ??
    messageMutation.error?.message ??
    generateMutation.error?.message ??
    null;

  // Opens when athlete clicks coach interview: starts a new interview when
  // none is active, or when the last one was already used to generate a plan.
  useEffect(() => {
    if (
      latest.isSuccess &&
      (!latest.data || latest.data.status === "generated") &&
      !autoStarted.current
    ) {
      autoStarted.current = true;
      startMutation.mutate({ restart: latest.data?.status === "generated" });
    }
  }, [latest.isSuccess, latest.data, startMutation]);

  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll should follow new messages
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [interview?.messages.length]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !interview || pending) return;
    setDraft("");
    messageMutation.mutate({ interviewId: interview.id, message: text });
  };

  const answer = (value: string) => {
    if (!interview || pending) return;
    messageMutation.mutate({ interviewId: interview.id, message: value });
  };

  const startNew = () => {
    startMutation.reset();
    messageMutation.reset();
    generateMutation.reset();
    queryClient.setQueryData(["plan-interview-latest"], null);
    setDraft("");
    startMutation.mutate({ restart: true });
  };

  return (
    <section
      ref={sectionRef}
      className="mt-4 rounded-3xl border border-sky-400/20 bg-sky-950/20 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300">
            {t.interview.title}
          </p>
          <h3 className="mt-1 text-lg font-bold text-white">{t.interview.subtitle}</h3>
          <p className="mt-1 text-[11px] text-slate-400">{t.interview.readingData}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10"
        >
          {t.common.close}
        </button>
      </div>

      <div
        ref={scrollRef}
        className="mt-4 max-h-[420px] space-y-3 overflow-y-auto rounded-2xl bg-black/20 p-3"
      >
        {latest.isLoading && !interview ? (
          <p className="text-xs text-slate-400">{t.common.loading}</p>
        ) : null}
        {!latest.isLoading && !interview && pending ? (
          <p className="text-xs text-slate-400">{t.interview.readingData}</p>
        ) : null}
        {interview?.messages.map((message) => (
          <div
            key={`${message.createdAt}-${message.role}-${message.content}`}
            className={cn(
              "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-5",
              message.role === "assistant"
                ? "bg-white/5 text-slate-200"
                : "ml-auto bg-lime-400/15 text-lime-100",
            )}
          >
            {message.content}
          </div>
        ))}
        {pending && interview ? (
          <p className="text-[11px] text-slate-400">{t.planBoard.loadingAdvice}</p>
        ) : null}
      </div>

      {interview?.status === "ready" ? (
        <div className="mt-4 rounded-2xl border border-lime-400/30 bg-lime-400/10 p-3">
          <p className="text-xs text-lime-100">{t.interview.readyBanner}</p>
          <button
            type="button"
            onClick={() => generateMutation.mutate(interview.id)}
            disabled={generateMutation.isPending}
            className="mt-2 rounded-xl bg-lime-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-lime-300 disabled:opacity-60"
          >
            {generateMutation.isPending
              ? t.interview.generating
              : t.interview.generateWithPreferences}
          </button>
        </div>
      ) : null}

      {interview?.status === "generated" ? (
        <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3">
          <p className="text-xs text-emerald-200">{t.interview.statusGenerated}</p>
          <button
            type="button"
            onClick={startNew}
            disabled={pending}
            className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
          >
            {t.planBoard.startInterview}
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11px] text-rose-300">
          <p>{error}</p>
          {!interview ? (
            <button
              type="button"
              onClick={startNew}
              disabled={pending}
              className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-white hover:bg-white/10 disabled:opacity-60"
            >
              {t.common.error} - {t.common.cancel}
            </button>
          ) : null}
        </div>
      ) : null}

      {interview && interview.status !== "generated" ? (
        <>
          {(interview.questions?.length ?? 0) > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {(interview.questions ?? []).flatMap((question) => {
                if (question.kind === "boolean") {
                  return [t.wizard.step2.parqYes, t.wizard.step2.parqNo].map((option) => (
                    <button
                      key={`${question.id}-${option}`}
                      type="button"
                      onClick={() => answer(option)}
                      disabled={pending}
                      className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-[11px] font-semibold text-sky-200 hover:bg-sky-400/20 disabled:opacity-60"
                    >
                      {option}
                    </button>
                  ));
                }
                return (question.options ?? []).map((option) => (
                  <button
                    key={`${question.id}-${option}`}
                    type="button"
                    onClick={() => answer(option)}
                    disabled={pending}
                    className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-[11px] font-semibold text-sky-200 hover:bg-sky-400/20 disabled:opacity-60"
                  >
                    {option}
                  </button>
                ));
              })}
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-3 flex gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t.interview.inputPlaceholder}
              disabled={pending}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-slate-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={pending || draft.trim().length === 0}
              className="rounded-xl bg-lime-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-lime-300 disabled:opacity-60"
            >
              {pending ? t.interview.sending : t.interview.send}
            </button>
          </form>
        </>
      ) : null}
    </section>
  );
}
