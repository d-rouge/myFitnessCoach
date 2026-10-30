import { describe, expect, it } from "vitest";
import { detectInitialLocale } from "./context";
import { en } from "./en";
import { it as itTranslations } from "./it";

describe("i18n System", () => {
  describe("detectInitialLocale", () => {
    it("should return persisted locale from localStorage if set to it", () => {
      const storage: Record<string, string> = { "health-trainer.locale": "it" };
      const locale = detectInitialLocale(
        { getItem: (key: string) => storage[key] ?? null } as Storage,
        { language: "en-US", languages: ["en-US", "en"] },
      );
      expect(locale).toBe("it");
    });

    it("should return persisted locale from localStorage if set to en", () => {
      const storage: Record<string, string> = { "health-trainer.locale": "en" };
      const locale = detectInitialLocale(
        { getItem: (key: string) => storage[key] ?? null } as Storage,
        { language: "it-IT", languages: ["it-IT", "it"] },
      );
      expect(locale).toBe("en");
    });

    it("should auto-detect Italian from browser language when no persisted setting", () => {
      const locale = detectInitialLocale({ getItem: () => null } as unknown as Storage, {
        language: "it-IT",
        languages: ["it-IT", "it", "en"],
      });
      expect(locale).toBe("it");
    });

    it("should default to English when browser is English or other languages", () => {
      const locale = detectInitialLocale({ getItem: () => null } as unknown as Storage, {
        language: "fr-FR",
        languages: ["fr-FR", "en-US"],
      });
      expect(locale).toBe("en");
    });

    it("should default to English when navigator has no languages", () => {
      const locale = detectInitialLocale({ getItem: () => null } as unknown as Storage, {
        language: "",
        languages: [],
      });
      expect(locale).toBe("en");
    });
  });

  describe("Dictionary parity and structure", () => {
    function getDeepKeys(obj: Record<string, unknown>, prefix = ""): string[] {
      let keys: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          typeof value !== "function"
        ) {
          keys = keys.concat(getDeepKeys(value as Record<string, unknown>, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys.sort();
    }

    it("should have matching section keys between EN and IT dictionaries", () => {
      const enSections = Object.keys(en).sort();
      const itSections = Object.keys(itTranslations).sort();
      expect(itSections).toEqual(enSections);
    });

    it("should have complete translation parity for common and auth sections", () => {
      const enCommonKeys = Object.keys(en.common).sort();
      const itCommonKeys = Object.keys(itTranslations.common).sort();
      expect(itCommonKeys).toEqual(enCommonKeys);

      const enAuthKeys = Object.keys(en.auth).sort();
      const itAuthKeys = Object.keys(itTranslations.auth).sort();
      expect(itAuthKeys).toEqual(enAuthKeys);
    });

    it("should have deep translation key parity across all dictionaries", () => {
      const enKeys = getDeepKeys(en as unknown as Record<string, unknown>);
      const itKeys = getDeepKeys(itTranslations as unknown as Record<string, unknown>);
      expect(itKeys).toEqual(enKeys);
    });

    it("should correctly provide functional translation helpers in both languages", () => {
      expect(en.wizard.stepOf(2, 6)).toBe("Step 2 of 6");
      expect(itTranslations.wizard.stepOf(2, 6)).toBe("Passo 2 di 6");

      expect(en.planBoard.macrocycleInfo(3, 12)).toBe("Macrocycle: Week 3 of 12");
      expect(itTranslations.planBoard.macrocycleInfo(3, 12)).toBe("Macrociclo: Settimana 3 di 12");
    });
  });
});
