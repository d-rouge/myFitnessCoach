import { DEEPSEEK_MODELS, DeepSeekProvider, DeterministicCoachProvider } from "@health-trainer/ai";
import type { Env } from "@health-trainer/config";
import { describe, expect, it } from "vitest";
import { createLlmProvider, isLlmConfigured, llmSettings } from "./llm.provider.js";

const env = (patch: Partial<Record<string, string>>) => patch as unknown as Env;

describe("llmSettings", () => {
  it("usa il modello pro con thinking per la pianificazione", () => {
    expect(llmSettings(env({}), "planning")).toEqual({
      model: DEEPSEEK_MODELS.pro,
      thinking: true,
    });
  });

  it("usa flash senza thinking per la narrazione", () => {
    expect(llmSettings(env({}), "coach")).toEqual({
      model: DEEPSEEK_MODELS.flash,
      thinking: false,
    });
  });

  it("rispetta gli override da .env", () => {
    const settings = llmSettings(
      env({ LLM_MODEL: "modello-custom-pro", LLM_MODEL_FAST: "modello-custom-flash" }),
      "planning",
    );
    expect(settings.model).toBe("modello-custom-pro");

    expect(llmSettings(env({ LLM_MODEL_FAST: "modello-custom-flash" }), "coach").model).toBe(
      "modello-custom-flash",
    );
  });
});

describe("createLlmProvider", () => {
  it("resta sul provider deterministico quando DeepSeek non è configurato", () => {
    expect(isLlmConfigured(env({}))).toBe(false);

    const provider = createLlmProvider(env({ LLM_PROVIDER: "deepseek" }), "coach");
    expect(provider).toBeInstanceOf(DeterministicCoachProvider);
  });

  it("usa DeepSeek quando provider e chiave sono presenti", () => {
    const configured = env({ LLM_PROVIDER: "deepseek", LLM_API_KEY: "test-key" });
    expect(isLlmConfigured(configured)).toBe(true);

    const provider = createLlmProvider(configured, "planning");
    expect(provider).toBeInstanceOf(DeepSeekProvider);
    expect(provider.id).toBe("deepseek");
  });

  it("non inventa provider non ancora cablati: openai resta deterministico", () => {
    const provider = createLlmProvider(
      env({ LLM_PROVIDER: "openai", LLM_API_KEY: "test-key" }),
      "coach",
    );
    expect(provider).toBeInstanceOf(DeterministicCoachProvider);
  });
});
