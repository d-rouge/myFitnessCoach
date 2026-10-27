import type { z } from "zod";
import { LlmProviderError } from "../errors.js";
import type { LlmProvider, LlmRequest, LlmResponse } from "../index.js";

/**
 * DeepSeek API nativa, formato OpenAI.
 *
 * Documentazione di riferimento (verificata il 27 ottobre 2026):
 * - base URL: `https://api.deepseek.com`
 * - modelli: `deepseek-v4-pro`, `deepseek-flash`
 * - JSON mode: `response_format: { type: "json_object" }`, con la parola "json"
 *   presente nel prompt e un esempio del formato atteso
 * - thinking mode: `thinking: { type: "enabled" | "disabled" }`; in thinking
 *   mode `temperature` viene ignorata, quindi non la inviamo
 *
 * Nota operativa: in JSON mode l'API può restituire `content` vuoto. È un
 * guasto transitorio, quindi l'errore è marcato `retryable` e il chiamante può
 * riprovare.
 */
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export const DEEPSEEK_MODELS = {
  /** Ragionamento e pianificazione: più costoso, più lento, più accurato. */
  pro: "deepseek-v4-pro",
  /** Narrazione e task brevi: economico e veloce. */
  flash: "deepseek-flash",
} as const;

export type DeepSeekModel = (typeof DEEPSEEK_MODELS)[keyof typeof DEEPSEEK_MODELS];

export interface DeepSeekProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Iniettabile nei test: nessuna rete in CI. */
  fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: { content?: string | null; reasoning_content?: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
  error?: { message?: string; type?: string; code?: string };
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 4096;
/** Tentativi aggiuntivi quando la JSON mode restituisce contenuto vuoto. */
const EMPTY_CONTENT_RETRIES = 1;
const EMPTY_CONTENT_RETRY_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Estrae l'oggetto JSON dalla risposta.
 *
 * Nonostante `response_format: json_object`, i modelli a volte incapsulano il
 * risultato in un blocco markdown o aggiungono una frase prima. Recuperare il
 * JSON evita un errore che non dipende dai dati ma solo dalla formattazione.
 */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) return fenced[1].trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);

  return trimmed;
}

/** JSON mode richiede la parola "json" nel prompt: la aggiungiamo se manca. */
function ensureJsonMentioned(system: string): string {
  if (/json/i.test(system)) return system;
  return `${system}\n\nRispondi esclusivamente con un unico oggetto JSON valido, senza testo fuori dal JSON.`;
}

export class DeepSeekProvider implements LlmProvider {
  readonly id = "deepseek" as const;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DeepSeekProviderOptions) {
    if (!options.apiKey) {
      throw new LlmProviderError("deepseek", "DEEPSEEK api key mancante", {
        retryable: false,
      });
    }
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEEPSEEK_MODELS.flash;
    this.baseUrl = (options.baseUrl ?? DEEPSEEK_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate<TSchema extends z.ZodType>(
    request: LlmRequest<TSchema>,
  ): Promise<LlmResponse<z.infer<TSchema>>> {
    const started = Date.now();
    const model = request.model ?? this.model;

    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: ensureJsonMentioned(request.system) },
        { role: "user", content: request.user },
      ],
      response_format: { type: "json_object" },
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: false,
    };

    // In thinking mode `temperature` è ignorata dall'API: inviarla darebbe
    // l'illusione di controllare la variabilità.
    if (request.thinking) {
      body.thinking = { type: "enabled" };
      body.reasoning_effort = request.reasoningEffort ?? "high";
    } else {
      body.thinking = { type: "disabled" };
      if (request.temperature !== undefined) body.temperature = request.temperature;
    }

    // La JSON mode di DeepSeek può restituire `content` vuoto in modo
    // intermittente (comportamento documentato). Un secondo tentativo risolve
    // quasi sempre e costa poco: meglio di un 503 all'utente.
    let lastFinishReason: string | undefined;
    for (let attempt = 0; ; attempt += 1) {
      const { response, payload } = await this.post(body);

      if (!response.ok) {
        throw this.errorFromStatus(response.status, payload);
      }

      const choice = payload.choices?.[0];
      lastFinishReason = choice?.finish_reason;
      const content = choice?.message?.content?.trim() ?? "";

      if (content.length === 0) {
        if (attempt < EMPTY_CONTENT_RETRIES) {
          await sleep(EMPTY_CONTENT_RETRY_DELAY_MS);
          continue;
        }
        throw new LlmProviderError(
          "deepseek",
          `DeepSeek ha restituito una risposta vuota (JSON mode, finish_reason: ${lastFinishReason ?? "n/a"}): riprova`,
          { retryable: true },
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJson(content));
      } catch (error) {
        throw new LlmProviderError("deepseek", "La risposta DeepSeek non è JSON valido", {
          retryable: true,
          cause: error,
        });
      }

      const validated = request.schema.safeParse(parsed);
      if (!validated.success) {
        const details = validated.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ");
        throw new LlmProviderError("deepseek", `Risposta fuori schema: ${details}`, {
          retryable: true,
        });
      }

      return {
        data: validated.data,
        provider: this.id,
        model: payload.model ?? model,
        usage: {
          inputTokens: payload.usage?.prompt_tokens,
          outputTokens: payload.usage?.completion_tokens,
        },
        // I prezzi DeepSeek variano tra peak e off-peak: il costo lo calcola il
        // chiamante, non il provider.
        latencyMs: Date.now() - started,
      };
    }
  }

  private async post(
    body: Record<string, unknown>,
  ): Promise<{ response: Response; payload: ChatCompletionResponse }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = controller.signal.aborted;
      throw new LlmProviderError(
        "deepseek",
        aborted
          ? `Timeout DeepSeek dopo ${this.timeoutMs} ms`
          : `DeepSeek non raggiungibile: ${error instanceof Error ? error.message : String(error)}`,
        { retryable: true, cause: error },
      );
    } finally {
      clearTimeout(timer);
    }

    const payload = (await this.parseJson(response)) as ChatCompletionResponse;
    return { response, payload };
  }

  private async parseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private errorFromStatus(status: number, payload: ChatCompletionResponse): LlmProviderError {
    const detail = payload?.error?.message ? `: ${payload.error.message}` : "";

    if (status === 401 || status === 403) {
      return new LlmProviderError("deepseek", `DeepSeek ha rifiutato la chiave API${detail}`, {
        status,
        retryable: false,
      });
    }
    if (status === 402) {
      return new LlmProviderError("deepseek", `Credito DeepSeek esaurito${detail}`, {
        status,
        retryable: false,
      });
    }
    if (status === 429) {
      return new LlmProviderError("deepseek", `Rate limit DeepSeek${detail}`, {
        status,
        retryable: true,
      });
    }
    if (status >= 500) {
      return new LlmProviderError("deepseek", `Errore DeepSeek ${status}${detail}`, {
        status,
        retryable: true,
      });
    }
    return new LlmProviderError("deepseek", `Richiesta rifiutata (${status})${detail}`, {
      status,
      retryable: false,
    });
  }
}

export function isDeepSeekModel(value: string): boolean {
  return value === DEEPSEEK_MODELS.pro || value === DEEPSEEK_MODELS.flash;
}
