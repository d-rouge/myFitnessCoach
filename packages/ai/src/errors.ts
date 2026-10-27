import type { LlmProviderId } from "./index.js";

/**
 * Errore normalizzato di un provider LLM.
 *
 * `retryable` distingue i guasti transitori (rate limit, timeout, risposta
 * troncata, schema non rispettato) da quelli definitivi (chiave non valida,
 * credito esaurito, richiesta malformata): il loop Proposer/Critic userà questo
 * flag per decidere se riprovare o passare al piano di fallback.
 *
 * Il messaggio non contiene mai la chiave API né header di autenticazione.
 */
export class LlmProviderError extends Error {
  readonly provider: LlmProviderId;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    provider: LlmProviderId,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "LlmProviderError";
    this.provider = provider;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}
