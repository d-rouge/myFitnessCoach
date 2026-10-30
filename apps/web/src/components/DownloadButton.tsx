import { cn } from "@health-trainer/ui";
import { type ReactNode, useState } from "react";
import { useI18n } from "../i18n";
import { downloadWithAuth } from "../lib/api";

interface DownloadButtonProps {
  url: string;
  filename: string;
  children: ReactNode;
  className?: string;
}

/**
 * Download link that carries the bearer token. Plain <a href> cannot send
 * Authorization headers, so protected files are fetched as blobs.
 */
export function DownloadButton({ url, filename, children, className }: DownloadButtonProps) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleClick = async () => {
    setError(null);
    setIsDownloading(true);
    try {
      await downloadWithAuth(url, filename);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isDownloading}
        className={cn(className, "disabled:cursor-not-allowed disabled:opacity-60")}
      >
        {isDownloading ? t.common.downloading : children}
      </button>
      {error ? <span className="text-[11px] text-rose-300">{error}</span> : null}
    </span>
  );
}
