import { cn } from "@health-trainer/ui";
import { useI18n } from "./context";
import type { SupportedLocale } from "./types";

interface LanguageSelectorProps {
  className?: string;
  size?: "sm" | "md";
}

export function LanguageSelector({ className, size = "sm" }: LanguageSelectorProps) {
  const { locale, setLocale, t } = useI18n();

  const options: Array<{ code: SupportedLocale; label: string; title: string }> = [
    { code: "en", label: "EN", title: t.common.english },
    { code: "it", label: "IT", title: t.common.italian },
  ];

  return (
    // biome-ignore lint/a11y/useSemanticElements: gruppo di toggle, non un form
    <div
      role="group"
      aria-label={t.common.selectLanguage}
      className={cn(
        "inline-flex items-center rounded-xl border border-white/10 bg-slate-950/60 p-0.5 shadow-sm backdrop-blur",
        className,
      )}
    >
      {options.map((option) => {
        const isActive = locale === option.code;
        return (
          <button
            key={option.code}
            type="button"
            onClick={() => setLocale(option.code)}
            title={option.title}
            aria-pressed={isActive}
            className={cn(
              "rounded-lg font-bold tracking-wider transition-all",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
              isActive
                ? "bg-lime-300 text-slate-950 shadow-sm"
                : "text-slate-400 hover:text-slate-200",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
