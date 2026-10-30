import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { en } from "./en";
import { it } from "./it";
import type { I18nContextType, SupportedLocale, TranslationDictionary } from "./types";

const STORAGE_KEY = "health-trainer.locale";

export function detectInitialLocale(
  storage?: Storage,
  nav?: { language?: string; languages?: readonly string[] },
): SupportedLocale {
  try {
    const s = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    const saved = s?.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "it") {
      return saved;
    }
  } catch {
    // LocalStorage inaccessible
  }

  const targetNav = nav ?? (typeof navigator !== "undefined" ? navigator : undefined);
  if (targetNav) {
    const languages =
      Array.isArray(targetNav.languages) && targetNav.languages.length > 0
        ? targetNav.languages
        : [targetNav.language];

    for (const lang of languages) {
      if (!lang) continue;
      const lower = lang.toLowerCase();
      if (lower.startsWith("it")) return "it";
      if (lower.startsWith("en")) return "en";
    }
  }

  return "en";
}

const I18nContext = createContext<I18nContextType | null>(null);

const DICTIONARIES: Record<SupportedLocale, TranslationDictionary> = {
  en,
  it,
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(detectInitialLocale);

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const formatDate = useCallback(
    (iso: string) => {
      try {
        return new Intl.DateTimeFormat(locale === "it" ? "it-IT" : "en-US", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(new Date(iso));
      } catch {
        return iso;
      }
    },
    [locale],
  );

  const formatDateTime = useCallback(
    (iso: string) => {
      try {
        return new Intl.DateTimeFormat(locale === "it" ? "it-IT" : "en-US", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(iso));
      } catch {
        return iso;
      }
    },
    [locale],
  );

  const formatDuration = useCallback((minutes: number | null) => {
    if (minutes === null || minutes === undefined) return "—";
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `${rest} min`;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }, []);

  const value = useMemo<I18nContextType>(
    () => ({
      locale,
      setLocale,
      t: DICTIONARIES[locale] ?? DICTIONARIES.en,
      formatDate,
      formatDateTime,
      formatDuration,
    }),
    [locale, setLocale, formatDate, formatDateTime, formatDuration],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
