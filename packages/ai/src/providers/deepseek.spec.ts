import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmProviderError } from "../errors.js";
import { DEEPSEEK_BASE_URL, DEEPSEEK_MODELS, DeepSeekProvider } from "./deepseek.js";

const AdviceSchema = z.object({
  headline: z.string(),
  tips: z.array(z.string()),
});

const validAnswer = { headline: "Corsa facile", tips: ["Riscaldati 5 minuti"] };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function completion(content: string | null, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({
    model: DEEPSEEK_MODELS.flash,
    choices: [{ message: { content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 120, completion_tokens: 45 },
    ...extra,
  });
}

function providerWith(fetchImpl: typeof fetch) {
  return new DeepSeekProvider({
    apiKey: "test-key-not-a-secret",
    model: DEEPSEEK_MODELS.flash,
    fetchImpl,
  });
}

const baseRequest = {
  task: "daily" as const,
  system: "Sei un preparatore. Rispondi con un oggetto json.",
  user: "Dati atleta",
  schema: AdviceSchema,
};

describe("DeepSeekProvider", () => {
  it("invia una richiesta in formato OpenAI con JSON mode", async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      captured.url = String(url);
      captured.init = init ?? {};
      return completion(JSON.stringify(validAnswer));
    }) as unknown as typeof fetch;

    const provider = providerWith(fetchImpl);
    const response = await provider.generate({
      ...baseRequest,
      temperature: 0.5,
      maxTokens: 900,
    });

    expect(captured.url).toBe(`${DEEPSEEK_BASE_URL}/chat/completions`);
    expect(captured.init?.method).toBe("POST");
    const headers = captured.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key-not-a-secret");

    const body = JSON.parse(String(captured.init?.body));
    expect(body.model).toBe(DEEPSEEK_MODELS.flash);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_tokens).toBe(900);
    expect(body.stream).toBe(false);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.temperature).toBe(0.5);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1]).toEqual({ role: "user", content: "Dati atleta" });

    expect(response.data).toEqual(validAnswer);
    expect(response.provider).toBe("deepseek");
    expect(response.usage).toEqual({ inputTokens: 120, outputTokens: 45 });
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("attiva il thinking senza inviare temperature", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return completion(JSON.stringify(validAnswer));
    }) as unknown as typeof fetch;

    await providerWith(fetchImpl).generate({
      ...baseRequest,
      thinking: true,
      reasoningEffort: "high",
      temperature: 0.2,
    });

    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.reasoning_effort).toBe("high");
    expect(body.temperature).toBeUndefined();
  });

  it("aggiunge la parola json al system prompt se manca", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return completion(JSON.stringify(validAnswer));
    }) as unknown as typeof fetch;

    await providerWith(fetchImpl).generate({
      ...baseRequest,
      system: "Sei un preparatore atletico.",
    });

    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]?.content).toMatch(/json/i);
  });

  it("permette di scegliere il modello per la singola richiesta", async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return completion(JSON.stringify(validAnswer));
    }) as unknown as typeof fetch;

    await providerWith(fetchImpl).generate({ ...baseRequest, model: DEEPSEEK_MODELS.pro });

    expect(body.model).toBe(DEEPSEEK_MODELS.pro);
  });

  it("classifica la chiave non valida come errore definitivo", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: "Authentication Fails" } }, 401),
    ) as unknown as typeof fetch;

    const error = await providerWith(fetchImpl)
      .generate(baseRequest)
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(LlmProviderError);
    expect((error as LlmProviderError).status).toBe(401);
    expect((error as LlmProviderError).retryable).toBe(false);
    expect((error as LlmProviderError).message).toMatch(/chiave API/i);
  });

  it("classifica il rate limit come errore ritentabile", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: "Rate limit reached" } }, 429),
    ) as unknown as typeof fetch;

    const error = (await providerWith(fetchImpl)
      .generate(baseRequest)
      .catch((err: unknown) => err)) as LlmProviderError;

    expect(error.status).toBe(429);
    expect(error.retryable).toBe(true);
  });

  it("tratta il contenuto vuoto come guasto transitorio", async () => {
    const fetchImpl = vi.fn(async () => completion(null)) as unknown as typeof fetch;

    const error = (await providerWith(fetchImpl)
      .generate(baseRequest)
      .catch((err: unknown) => err)) as LlmProviderError;

    expect(error.retryable).toBe(true);
    expect(error.message).toMatch(/vuota/i);
  });

  it("rifiuta un JSON malformato e lo segnala come ritentabile", async () => {
    const fetchImpl = vi.fn(async () => completion("{non json")) as unknown as typeof fetch;

    const error = (await providerWith(fetchImpl)
      .generate(baseRequest)
      .catch((err: unknown) => err)) as LlmProviderError;

    expect(error.retryable).toBe(true);
    expect(error.message).toMatch(/JSON valido/i);
  });

  it("rifiuta una risposta fuori schema indicando il campo", async () => {
    const fetchImpl = vi.fn(async () =>
      completion(JSON.stringify({ headline: "ok", tips: "non è un array" })),
    ) as unknown as typeof fetch;

    const error = (await providerWith(fetchImpl)
      .generate(baseRequest)
      .catch((err: unknown) => err)) as LlmProviderError;

    expect(error.retryable).toBe(true);
    expect(error.message).toMatch(/tips/);
  });

  it("interrompe la chiamata al timeout", async () => {
    const fetchImpl = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })) as unknown as typeof fetch;

    const provider = new DeepSeekProvider({
      apiKey: "test-key-not-a-secret",
      fetchImpl,
      timeoutMs: 10,
    });

    const error = (await provider
      .generate(baseRequest)
      .catch((err: unknown) => err)) as LlmProviderError;

    expect(error).toBeInstanceOf(LlmProviderError);
    expect(error.retryable).toBe(true);
    expect(error.message).toMatch(/Timeout/);
  });

  it("non espone mai la chiave nel messaggio d'errore", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: "boom" } }, 500),
    ) as unknown as typeof fetch;

    const error = (await providerWith(fetchImpl)
      .generate(baseRequest)
      .catch((err: unknown) => err)) as LlmProviderError;

    expect(error.message).not.toContain("test-key-not-a-secret");
  });
});
