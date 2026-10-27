import {
  DEEPSEEK_MODELS,
  DeepSeekProvider,
  DeterministicCoachProvider,
  type LlmProvider,
} from "@health-trainer/ai";
import type { Env } from "@health-trainer/config";

/**
 * Scopo della chiamata. Determina modello e chain-of-thought:
 * - `coach`: narrazione breve e frequente → `flash`, senza thinking.
 * - `planning`: macro/micro piano, critica → `pro`, con thinking.
 */
export type LlmPurpose = "coach" | "planning";

export interface LlmSettings {
  model: string;
  thinking: boolean;
}

/**
 * Traduce la configurazione in una scelta concreta di modello.
 * Le variabili restano opzionali: se mancano si usano i default DeepSeek, così
 * cambiare modello è una modifica di `.env`, non di codice.
 */
export function llmSettings(env: Env, purpose: LlmPurpose): LlmSettings {
  const pro = env.LLM_MODEL ?? DEEPSEEK_MODELS.pro;
  const flash = env.LLM_MODEL_FAST ?? DEEPSEEK_MODELS.flash;

  return purpose === "planning"
    ? { model: pro, thinking: true }
    : { model: flash, thinking: false };
}

export function isLlmConfigured(env: Env): boolean {
  // DeepSeek richiede la chiave; senza di essa si resta sul provider
  // deterministico invece di fallire a runtime.
  return Boolean(env.LLM_PROVIDER && env.LLM_API_KEY);
}

/**
 * Provider da usare per un dato scopo.
 *
 * Senza configurazione restituisce il provider deterministico: l'app continua a
 * funzionare offline invece di rompersi. Il chiamante può distinguere i due casi
 * da `provider.id`.
 */
export function createLlmProvider(env: Env, purpose: LlmPurpose): LlmProvider {
  if (env.LLM_PROVIDER === "deepseek" && env.LLM_API_KEY) {
    return new DeepSeekProvider({
      apiKey: env.LLM_API_KEY,
      baseUrl: env.LLM_BASE_URL,
      model: llmSettings(env, purpose).model,
      timeoutMs: env.LLM_TIMEOUT_MS,
    });
  }

  return new DeterministicCoachProvider();
}
