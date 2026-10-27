import "dotenv/config";
import {
  COACH_RESPONSE_EXAMPLE,
  COACH_SYSTEM_PROMPT,
  COACH_USER_INSTRUCTION,
  CoachAdviceSchema,
  DEEPSEEK_MODELS,
  DeepSeekProvider,
  LlmProviderError,
} from "@health-trainer/ai";
import { loadEnv } from "@health-trainer/config";

/**
 * Verifica manuale del collegamento a DeepSeek.
 *
 * Non stampa mai la chiave. Costa pochi token per modello.
 *
 *   npm run spike:deepseek            # solo flash (economico)
 *   npm run spike:deepseek -- --all   # flash + v4-pro con thinking
 */

async function main(): Promise<void> {
  const env = loadEnv();
  const testBoth = process.argv.includes("--all");

  if (env.LLM_PROVIDER !== "deepseek" || !env.LLM_API_KEY) {
    console.error(
      "DeepSeek non configurato: imposta LLM_PROVIDER=deepseek e LLM_API_KEY in .env (non incollare la chiave in chat).",
    );
    process.exit(1);
  }

  const provider = new DeepSeekProvider({
    apiKey: env.LLM_API_KEY,
    baseUrl: env.LLM_BASE_URL,
    timeoutMs: env.LLM_TIMEOUT_MS ?? 30_000,
  });

  const payload = {
    athleteName: "Test",
    tone: "direct",
    session: {
      id: "sess_test",
      date: new Date().toISOString().slice(0, 10),
      sport: "running",
      type: "run",
      title: "Corsa Facile 30'",
      durationMin: 30,
      intensity: { mode: "rpe", rpe: 4, target: "Z2" },
      blocks: [],
    },
    readinessBand: "optimal",
  };

  const plan: Array<{ label: string; model: string; thinking: boolean }> = [
    { label: "flash (coach)", model: DEEPSEEK_MODELS.flash, thinking: false },
  ];
  if (testBoth) {
    plan.push({ label: "v4-pro (planning)", model: DEEPSEEK_MODELS.pro, thinking: true });
  }

  let failures = 0;

  for (const entry of plan) {
    const started = Date.now();
    try {
      const response = await provider.generate({
        task: "daily",
        system: [
          COACH_SYSTEM_PROMPT,
          COACH_USER_INSTRUCTION,
          `Esempio JSON: ${COACH_RESPONSE_EXAMPLE}`,
        ].join("\n\n"),
        user: JSON.stringify(payload),
        schema: CoachAdviceSchema,
        model: entry.model,
        thinking: entry.thinking,
        temperature: entry.thinking ? undefined : 0.5,
        maxTokens: 800,
      });

      console.log(`\nOK ${entry.label}`);
      console.log(`  modello:  ${response.model}`);
      console.log(`  latenza:  ${response.latencyMs} ms (totale ${Date.now() - started} ms)`);
      console.log(
        `  token:    in ${response.usage.inputTokens ?? "?"} / out ${response.usage.outputTokens ?? "?"}`,
      );
      console.log(`  headline: ${response.data.headline}`);
    } catch (error) {
      failures += 1;
      if (error instanceof LlmProviderError) {
        console.error(
          `\nKO ${entry.label}: ${error.message} (status ${error.status ?? "n/a"}, ritentabile: ${error.retryable})`,
        );
      } else {
        console.error(
          `\nKO ${entry.label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(
    `Spike DeepSeek fallito: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
